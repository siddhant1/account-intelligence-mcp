import { ApiKeyService } from './auth/apiKeyService.js';
import type { AppConfig } from './config.js';
import { openDatabase, type Db } from './db/database.js';
import { systemClock, type Clock } from './domain/clock.js';
import type { Logger } from './logger.js';
import { ApiKeyRepository } from './repositories/apiKeyRepository.js';
import { CompanyRepository } from './repositories/companyRepository.js';
import { ContactRepository } from './repositories/contactRepository.js';
import { ExportRepository } from './repositories/exportRepository.js';
import { CompanyService } from './services/companyService.js';
import { ContactService } from './services/contactService.js';
import { SimulatedEnrichmentProvider, type EnrichmentProvider } from './services/enrichment/enrichmentProvider.js';
import { ExportService } from './services/exportService.js';
import { UrlSigner } from './services/urlSigner.js';

export interface Services {
  companies: CompanyService;
  contacts: ContactService;
  exports: ExportService;
  apiKeys: ApiKeyService;
}

export interface Container {
  config: AppConfig;
  logger: Logger;
  db: Db;
  services: Services;
  close(): void;
}

export interface ContainerOverrides {
  db?: Db;
  clock?: Clock;
  enrichmentProvider?: EnrichmentProvider;
}

/** Composition root: the only place that knows how the layers are wired together. */
export function createContainer(config: AppConfig, logger: Logger, overrides: ContainerOverrides = {}): Container {
  const db = overrides.db ?? openDatabase(config.databasePath);
  const clock = overrides.clock ?? systemClock;

  const companyRepository = new CompanyRepository(db);
  const contactRepository = new ContactRepository(db);

  const services: Services = {
    companies: new CompanyService(companyRepository),
    contacts: new ContactService(
      contactRepository,
      companyRepository,
      overrides.enrichmentProvider ?? new SimulatedEnrichmentProvider(config.enrichment.latencyMs),
      clock,
    ),
    exports: new ExportService(
      contactRepository,
      new ExportRepository(db),
      new UrlSigner(config.exports.signingSecret, config.http.publicBaseUrl),
      clock,
      config.exports.urlTtlSeconds,
    ),
    apiKeys: new ApiKeyService(new ApiKeyRepository(db), clock),
  };

  return { config, logger, db, services, close: () => db.close() };
}
