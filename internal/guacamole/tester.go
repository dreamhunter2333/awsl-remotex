package guacamole

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

type Tester struct {
	address string
	timeout time.Duration
}

func NewTester(address string, timeout time.Duration) *Tester {
	return &Tester{address: address, timeout: timeout}
}

func (tester *Tester) Ping(ctx context.Context) error {
	if tester == nil || tester.address == "" {
		return errors.New("guacd is not configured")
	}
	dialer := net.Dialer{Timeout: tester.timeout}
	connection, err := dialer.DialContext(ctx, "tcp", tester.address)
	if err != nil {
		return fmt.Errorf("connect guacd: %w", err)
	}
	return connection.Close()
}

func (tester *Tester) Test(ctx context.Context, asset assets.Asset, value credential.Value) error {
	if tester == nil || tester.address == "" {
		return errors.New("guacd is not configured")
	}
	dialer := net.Dialer{Timeout: tester.timeout}
	target, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(asset.Host, strconv.Itoa(asset.Port)))
	if err != nil {
		return fmt.Errorf("connect target: %w", err)
	}
	_ = target.Close()
	connection, err := dialer.DialContext(ctx, "tcp", tester.address)
	if err != nil {
		return fmt.Errorf("connect guacd: %w", err)
	}
	defer connection.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
	} else {
		_ = connection.SetDeadline(time.Now().Add(tester.timeout))
	}

	reader := bufio.NewReader(connection)
	if err := writeInstruction(connection, "select", asset.Protocol); err != nil {
		return err
	}
	opcode, args, err := readInstruction(reader)
	if err != nil {
		return fmt.Errorf("read guacd arguments: %w", err)
	}
	if opcode == "error" {
		return guacdError(args)
	}
	if opcode != "args" || len(args) == 0 {
		return fmt.Errorf("unexpected guacd response: %s", opcode)
	}

	parameters := ConnectionParameters(asset, value, "dark")
	version := args[0]
	values := make([]string, len(args))
	values[0] = version
	for index, name := range args[1:] {
		values[index+1] = parameters[name]
	}
	for _, instruction := range [][]string{
		{"size", "1280", "720", "96"},
		{"audio"},
		{"video"},
		{"image", "image/png", "image/jpeg"},
		{"timezone", "UTC"},
		{"name", "awsl-remotex-test"},
		append([]string{"connect"}, values...),
	} {
		if err := writeInstruction(connection, instruction...); err != nil {
			return err
		}
	}

	ready := false
	stable := false
	for {
		opcode, args, err = readInstruction(reader)
		if err != nil {
			var networkError net.Error
			if stable && errors.As(err, &networkError) && networkError.Timeout() {
				_ = writeInstruction(connection, "disconnect")
				return nil
			}
			return fmt.Errorf("wait for guacd connection: %w", err)
		}
		switch opcode {
		case "ready":
			ready = true
		case "sync":
			if !ready || len(args) == 0 {
				continue
			}
			_ = writeInstruction(connection, "sync", args[0])
			if !stable {
				stable = true
				_ = connection.SetReadDeadline(time.Now().Add(2 * time.Second))
			}
		case "blob":
			if ready && len(args) > 0 {
				_ = writeInstruction(connection, "ack", args[0], "", "0")
			}
		case "error":
			return guacdError(args)
		}
	}
}

func writeInstruction(writer io.Writer, elements ...string) error {
	encoded := make([]string, len(elements))
	for index, element := range elements {
		encoded[index] = strconv.Itoa(len([]rune(element))) + "." + element
	}
	_, err := io.WriteString(writer, strings.Join(encoded, ",")+";")
	return err
}

func readInstruction(reader *bufio.Reader) (string, []string, error) {
	elements := make([]string, 0, 8)
	for {
		lengthText, err := reader.ReadString('.')
		if err != nil {
			return "", nil, err
		}
		length, err := strconv.Atoi(strings.TrimSuffix(lengthText, "."))
		if err != nil || length < 0 {
			return "", nil, fmt.Errorf("invalid element length %q", lengthText)
		}
		value, err := readRunes(reader, length)
		if err != nil {
			return "", nil, err
		}
		delimiter, err := reader.ReadByte()
		if err != nil {
			return "", nil, err
		}
		elements = append(elements, value)
		if delimiter == ';' {
			break
		}
		if delimiter != ',' {
			return "", nil, fmt.Errorf("invalid delimiter %q", delimiter)
		}
	}
	if len(elements) == 0 {
		return "", nil, errors.New("empty instruction")
	}
	return elements[0], elements[1:], nil
}

func readRunes(reader *bufio.Reader, count int) (string, error) {
	var builder strings.Builder
	for range count {
		value, _, err := reader.ReadRune()
		if err != nil {
			return "", err
		}
		builder.WriteRune(value)
	}
	return builder.String(), nil
}

func guacdError(args []string) error {
	if len(args) == 0 {
		return errors.New("guacd rejected the connection")
	}
	return errors.New(args[0])
}
