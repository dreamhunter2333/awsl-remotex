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
	GetAssetWithCredential(context.Context, string) (Asset, credential.Value, error)
	ResolveCredential(context.Context, string, Input) (credential.Value, error)
}

type Connector interface {
	ConnectionURL(Asset, credential.Value, string) (string, time.Time, error)
}

type Tester interface {
	Test(context.Context, Asset, credential.Value) error
}

type ConnectionTicket struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
	Protocol  string    `json:"protocol"`
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

func (service *Service) Connect(ctx context.Context, id, theme string) (ConnectionTicket, error) {
	if service.connector == nil {
		return ConnectionTicket{}, errors.New("Apache Guacamole is not configured")
	}
	asset, value, err := service.repository.GetAssetWithCredential(ctx, id)
	if err != nil {
		return ConnectionTicket{}, err
	}
	url, expiresAt, err := service.connector.ConnectionURL(asset, value, theme)
	if err != nil {
		return ConnectionTicket{}, err
	}
	return ConnectionTicket{URL: url, ExpiresAt: expiresAt, Protocol: asset.Protocol}, nil
}

func (service *Service) TestSaved(ctx context.Context, id string) (loginUnverified bool, err error) {
	if service.tester == nil {
		return false, errors.New("guacd is not configured")
	}
	asset, value, err := service.repository.GetAssetWithCredential(ctx, id)
	if err != nil {
		return false, err
	}
	return asset.Protocol == "rdp", service.tester.Test(ctx, asset, value)
}

func (service *Service) TestInput(ctx context.Context, id string, input Input) (loginUnverified bool, err error) {
	if service.tester == nil {
		return false, errors.New("guacd is not configured")
	}
	if err := input.Normalize(); err != nil {
		return false, err
	}
	value, err := service.repository.ResolveCredential(ctx, id, input)
	if err != nil {
		return false, err
	}
	return input.Protocol == "rdp", service.tester.Test(ctx, Asset{
		ID:             id,
		Name:           input.Name,
		Group:          input.Group,
		Protocol:       input.Protocol,
		Host:           input.Host,
		Port:           input.Port,
		Username:       input.Username,
		Settings:       input.Settings,
		CredentialType: input.CredentialType,
	}, value)
}
