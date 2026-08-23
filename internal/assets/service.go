package assets

import (
	"context"
	"errors"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

type Repository interface {
	ListAssets(context.Context) ([]Asset, error)
	CreateAsset(context.Context, Input) (Asset, error)
	UpdateAsset(context.Context, string, Input) (Asset, error)
	DeleteAsset(context.Context, string) error
	GetAsset(context.Context, string) (Asset, error)
	GetCredential(context.Context, string) (credential.Value, error)
	ResolveCredential(context.Context, string, Input) (credential.Value, error)
}

type Connector interface {
	ConnectionURL(Asset, credential.Value, string) (string, time.Time, error)
}

type Tester interface {
	Test(context.Context, Asset, credential.Value) error
}

type Service struct {
	repository Repository
	connector  Connector
	tester     Tester
}

func NewService(repository Repository, connector Connector, tester Tester) *Service {
	return &Service{repository: repository, connector: connector, tester: tester}
}

func (service *Service) List(ctx context.Context) ([]Asset, error) {
	return service.repository.ListAssets(ctx)
}

func (service *Service) Create(ctx context.Context, input Input) (Asset, error) {
	return service.repository.CreateAsset(ctx, input)
}

func (service *Service) Update(ctx context.Context, id string, input Input) (Asset, error) {
	return service.repository.UpdateAsset(ctx, id, input)
}

func (service *Service) Delete(ctx context.Context, id string) error {
	return service.repository.DeleteAsset(ctx, id)
}

func (service *Service) Connect(ctx context.Context, id, theme string) (string, time.Time, error) {
	if service.connector == nil {
		return "", time.Time{}, errors.New("Apache Guacamole is not configured")
	}
	asset, err := service.repository.GetAsset(ctx, id)
	if err != nil {
		return "", time.Time{}, err
	}
	value, err := service.repository.GetCredential(ctx, id)
	if err != nil {
		return "", time.Time{}, err
	}
	return service.connector.ConnectionURL(asset, value, theme)
}

func (service *Service) TestSaved(ctx context.Context, id string) error {
	if service.tester == nil {
		return errors.New("guacd is not configured")
	}
	asset, err := service.repository.GetAsset(ctx, id)
	if err != nil {
		return err
	}
	value, err := service.repository.GetCredential(ctx, id)
	if err != nil {
		return err
	}
	return service.tester.Test(ctx, asset, value)
}

func (service *Service) TestInput(ctx context.Context, id string, input Input) error {
	if service.tester == nil {
		return errors.New("guacd is not configured")
	}
	if err := input.Normalize(); err != nil {
		return err
	}
	value, err := service.repository.ResolveCredential(ctx, id, input)
	if err != nil {
		return err
	}
	return service.tester.Test(ctx, Asset{
		ID:             id,
		Name:           input.Name,
		Group:          input.Group,
		Protocol:       input.Protocol,
		Host:           input.Host,
		Port:           input.Port,
		Username:       input.Username,
		CredentialType: input.CredentialType,
	}, value)
}
