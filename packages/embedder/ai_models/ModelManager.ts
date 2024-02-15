import {Kysely, sql} from 'kysely'

import {
  AbstractEmbeddingsModel,
  AbstractGenerationModel,
  EmbeddingModelConfig,
  GenerationModelConfig,
  ModelConfig
} from './AbstractModel'
import TextEmbeddingsInference from './TextEmbeddingsInference'
import TextGenerationInference from './TextGenerationInference'

interface ModelManagerConfig {
  embeddingModels: EmbeddingModelConfig[]
  generationModels: GenerationModelConfig[]
}

export type EmbeddingsModelType = 'text-embeddings-inference'
export type GenerationModelType = 'text-generation-inference'

export class ModelManager {
  embeddingModels: AbstractEmbeddingsModel[]
  embeddingModelsMapByTable: {[key: string]: AbstractEmbeddingsModel} | {}
  generationModels: AbstractGenerationModel[]

  private isValidConfig(
    maybeConfig: Partial<ModelManagerConfig>
  ): maybeConfig is ModelManagerConfig {
    if (!maybeConfig.embeddingModels || !Array.isArray(maybeConfig.embeddingModels)) {
      throw new Error('Invalid configuration: embedding_models is missing or not an array')
    }
    if (!maybeConfig.generationModels || !Array.isArray(maybeConfig.generationModels)) {
      throw new Error('Invalid configuration: summarization_models is missing or not an array')
    }

    maybeConfig.embeddingModels.forEach((model: ModelConfig) => {
      this.isValidModelConfig(model)
    })

    maybeConfig.generationModels.forEach((model: ModelConfig) => {
      this.isValidModelConfig(model)
    })

    return true
  }

  private isValidModelConfig(model: ModelConfig): model is ModelConfig {
    if (typeof model.model !== 'string') {
      throw new Error('Invalid ModelConfig: model field should be a string')
    }
    if (model.url !== undefined && typeof model.url !== 'string') {
      throw new Error('Invalid ModelConfig: url field should be a string')
    }

    return true
  }

  constructor(config: ModelManagerConfig) {
    // Validate configuration
    this.isValidConfig(config)

    // Initialize embeddings models
    this.embeddingModelsMapByTable = {}
    this.embeddingModels = config.embeddingModels.map((modelConfig) => {
      const [modelType, _] = modelConfig.model.split(':') as [EmbeddingsModelType, string]

      switch (modelType) {
        case 'text-embeddings-inference':
          const embeddingsModel = new TextEmbeddingsInference(modelConfig)
          this.embeddingModelsMapByTable[embeddingsModel.tableName] = embeddingsModel
          return embeddingsModel
        default:
          throw new Error(`unsupported embeddings model '${modelType}'`)
      }
    })

    // Initialize summarization models
    this.generationModels = config.generationModels.map((modelConfig) => {
      const [modelType, _] = modelConfig.model.split(':') as [GenerationModelType, string]

      switch (modelType) {
        case 'text-generation-inference':
          const generator = new TextGenerationInference(modelConfig)
          return generator
        default:
          throw new Error(`unsupported summarization model '${modelType}'`)
      }
    })
  }

  async maybeCreateTables(pg: Kysely<any>) {
    const maybePromises = this.embeddingModels.map(async (embeddingsModel) => {
      const tableName = embeddingsModel.tableName
      const hasTable =
        (
          await sql<number[]>`SELECT 1 FROM ${sql.id('pg_catalog', 'pg_tables')} WHERE ${sql.id(
            'tablename'
          )} = ${tableName}`.execute(pg)
        ).rows.length > 0
      if (hasTable) return undefined
      const vectorDimensions = embeddingsModel.modelParams.embeddingDimensions
      console.log(`ModelManager: creating ${tableName} with ${vectorDimensions} dimensions`)
      const query = sql`
      DO $$
  BEGIN
  CREATE TABLE IF NOT EXISTS ${sql.id(tableName)} (
    "id" INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "embedText" TEXT,
    "embedding" vector(${sql.raw(vectorDimensions.toString())}),
    "embeddingsMetadataId" INTEGER NOT NULL,
    FOREIGN KEY ("embeddingsMetadataId")
      REFERENCES "EmbeddingsMetadata"("id")
      ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "idx_${sql.raw(tableName)}_embedding_vector_cosign_ops"
    ON ${sql.id(tableName)}
    USING hnsw ("embedding" vector_cosine_ops);
  END $$;

      `
      return query.execute(pg)
    })
    Promise.all(maybePromises)
  }
}

let modelManager: ModelManager | undefined
export function getModelManager() {
  if (modelManager) return modelManager
  const {AI_EMBEDDING_MODELS, AI_GENERATION_MODELS} = process.env
  let config: ModelManagerConfig = {
    embeddingModels: [],
    generationModels: []
  }
  try {
    config.embeddingModels = AI_EMBEDDING_MODELS && JSON.parse(AI_EMBEDDING_MODELS)
  } catch (e) {
    throw new Error(`Invalid AI_EMBEDDING_MODELS .env JSON: ${e}`)
  }
  try {
    config.generationModels = AI_GENERATION_MODELS && JSON.parse(AI_GENERATION_MODELS)
  } catch (e) {
    throw new Error(`Invalid AI_GENERATION_MODELS .env JSON: ${e}`)
  }

  modelManager = new ModelManager(config)

  return modelManager
}

export default getModelManager
