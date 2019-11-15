/* @flow */

const tracer = require(`opentracing`).globalTracer()
const { store } = require(`../redux`)
const nodeStore = require(`../db/nodes`)
const { createSchemaComposer } = require(`./schema-composer`)
const { buildSchema, rebuildSchemaWithSitePage } = require(`./schema`)
const { builtInFieldExtensions } = require(`./extensions`)
const { TypeConflictReporter } = require(`./infer/type-conflict-reporter`)

const build = async ({ parentSpan }) => {
  const spanArgs = parentSpan ? { childOf: parentSpan } : {}
  const span = tracer.startSpan(`build schema`, spanArgs)

  const {
    schemaCustomization: {
      thirdPartySchemas,
      types,
      fieldExtensions: customFieldExtensions,
      printConfig,
    },
    inferenceMetadata,
    config: { mapping: typeMapping },
  } = store.getState()

  const fieldExtensions = {
    ...customFieldExtensions,
    ...builtInFieldExtensions,
  }

  const typeConflictReporter = new TypeConflictReporter()

  // Ensure that user-defined types are processed last
  const sortedTypes = [
    ...types.filter(
      type => type.plugin && type.plugin.name !== `default-site-plugin`
    ),
    ...types.filter(
      type => !type.plugin || type.plugin.name === `default-site-plugin`
    ),
  ]

  const schemaComposer = createSchemaComposer({ fieldExtensions })
  const schema = await buildSchema({
    schemaComposer,
    nodeStore,
    types: sortedTypes,
    fieldExtensions,
    thirdPartySchemas,
    typeMapping,
    printConfig,
    typeConflictReporter,
    inferenceMetadata,
    parentSpan,
  })

  typeConflictReporter.printConflicts()

  store.dispatch({
    type: `SET_SCHEMA_COMPOSER`,
    payload: schemaComposer,
  })
  store.dispatch({
    type: `SET_SCHEMA`,
    payload: schema,
  })

  span.finish()
}

const rebuildWithSitePage = async ({ parentSpan }) => {
  const spanArgs = parentSpan ? { childOf: parentSpan } : {}
  const span = tracer.startSpan(
    `rebuild schema with SitePage context`,
    spanArgs
  )

  const {
    schemaCustomization: { composer: schemaComposer, fieldExtensions },
    config: { mapping: typeMapping },
    inferenceMetadata,
  } = store.getState()

  const typeConflictReporter = new TypeConflictReporter()

  const schema = await rebuildSchemaWithSitePage({
    schemaComposer,
    nodeStore,
    fieldExtensions,
    typeMapping,
    typeConflictReporter,
    inferenceMetadata,
    parentSpan,
  })

  typeConflictReporter.printConflicts()

  store.dispatch({
    type: `SET_SCHEMA_COMPOSER`,
    payload: schemaComposer,
  })
  store.dispatch({
    type: `SET_SCHEMA`,
    payload: schema,
  })

  span.finish()
}

module.exports = {
  build,
  rebuild: build,
  rebuildWithSitePage,
}
