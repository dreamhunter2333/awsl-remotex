package guacamole

import (
	"bufio"
	"bytes"
	"reflect"
	"testing"
)

func TestInstructionRoundTrip(t *testing.T) {
	var buffer bytes.Buffer
	if err := writeInstruction(&buffer, "name", "御坂", "value"); err != nil {
		t.Fatal(err)
	}
	opcode, args, err := readInstruction(bufio.NewReader(&buffer))
	if err != nil {
		t.Fatal(err)
	}
	if opcode != "name" || !reflect.DeepEqual(args, []string{"御坂", "value"}) {
		t.Fatalf("unexpected instruction: %q %#v", opcode, args)
	}
}

func TestReadInstructionRejectsInvalidDelimiter(t *testing.T) {
	_, _, err := readInstruction(bufio.NewReader(bytes.NewBufferString("4.test!")))
	if err == nil {
		t.Fatal("expected invalid delimiter error")
	}
}
