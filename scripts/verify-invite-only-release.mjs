import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'invite-only-edge-manifest.json',
)
const CONFIG_PATH = path.join(REPOSITORY_ROOT, 'supabase', 'config.toml')
const FUNCTIONS_ROOT = path.join(REPOSITORY_ROOT, 'supabase', 'functions')

const EXPECTED_COUNTS = Object.freeze({
  changedFunctions: 103,
  deployedFunctions: 101,
  excludedFunctions: 2,
  retiredFunctions: 17,
  unauthenticatedTombstones: 5,
  edgeTypeScriptFiles: 129,
})

const EXPECTED_PHASE_KEYS = Object.freeze([
  '1_containment_tombstones_before_migrations',
  '2_fail_closed_handlers_before_migrations',
  '3_after_migrations_and_verifier',
])

const EXPECTED_RETIRED_FUNCTIONS = Object.freeze([
  'analyze-sales-call',
  'batch-update-orders',
  'classify-sales-call',
  'create-addon-checkout',
  'create-checkout-session',
  'generate-background-video',
  'generate-heygen-video',
  'get-client-portfolio',
  'get-customer-analytics',
  'get-outreach-podcasts-v2',
  'get-sales-call-analytics',
  'manage-admin-users',
  'send-portal-magic-link',
  'stripe-webhook',
  'sync-fathom-calls',
  'update-order-status',
  'verify-portal-token',
])

const EXPECTED_UNAUTHENTICATED_TOMBSTONES = Object.freeze([
  'get-client-portfolio',
  'get-outreach-podcasts-v2',
  'send-portal-magic-link',
  'stripe-webhook',
  'verify-portal-token',
])

const EXPECTED_FAIL_CLOSED_PHASE = Object.freeze([
  'get-client-bookings',
  'login-with-password',
  'logout-portal-session',
  'resend-webhook',
  'validate-portal-session',
])

const EXPECTED_EXCLUDED_FUNCTIONS = Object.freeze([
  'campaign-reply-webhook',
  'create-outreach-message',
])

const EXPECTED_PUBLIC_NON_JWT_FUNCTIONS = Object.freeze([
  'client-autopilot-tick',
  'client-onboarding',
  'get-client-bookings',
  'get-client-podcasts',
  'get-guest-resources',
  'get-prospect-dashboard',
  'get-prospect-podcasts',
  'login-with-password',
  'logout-portal-session',
  'portal-password-reset',
  'public-client-dashboard',
  'resend-webhook',
  'validate-portal-session',
])

const EXPECTED_EXPLICIT_JWT_FUNCTIONS = Object.freeze([
  'accept-workspace-invite',
  'account-context',
  'change-initial-password',
  'create-client-account',
  'create-prospect-sheet',
  'manage-client-portal-password',
  'manage-workspace-staff',
  'manage-workspace-users',
  'podscan-proxy',
  'provision-workspace-account',
  'workspace-client-campaigns',
  'workspace-client-podcast-system',
  'workspace-client-shortlist',
  'workspace-podcast-catalog',
  'workspace-clients',
  'workspace-guest-resources',
  'workspace-mailbox-infra',
  'workspace-onboarding',
])

const FUNCTION_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const EXPECTED_RELEASE_BASE_COMMIT = 'b46a737631ee840f2f49270bdfbbe392833e814a'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'))
}

function assertExactSet(actualValues, expectedValues, label) {
  const actual = sorted(new Set(actualValues))
  const expected = sorted(new Set(expectedValues))
  invariant(
    actual.length === expected.length
      && actual.every((value, index) => value === expected[index]),
    `${label} must be exactly [${expected.join(', ')}]; received [${actual.join(', ')}]`,
  )
}

function stringArray(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`)
  invariant(
    value.every(
      (entry) => typeof entry === 'string' && FUNCTION_NAME_PATTERN.test(entry),
    ),
    `${label} must contain only canonical function names`,
  )
  invariant(
    new Set(value).size === value.length,
    `${label} must not contain duplicate function names`,
  )
  return value
}

function gitText(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gitBuffer(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: REPOSITORY_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function assertCommitIsAncestor(ancestor, descendant, message) {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  invariant(result.status === 0, message)
}

function parseTomlAssignments(source) {
  const assignments = new Map()
  let section = ''

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, '').trim()
    if (line.length === 0 || line.startsWith('#')) continue

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/u)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u)
    if (!assignmentMatch || section.length === 0) continue

    const key = `${section}.${assignmentMatch[1]}`
    invariant(!assignments.has(key), `duplicate Supabase config key: ${key}`)
    assignments.set(key, assignmentMatch[2].trim())
  }

  return assignments
}

function assertConfigValue(assignments, key, expectedValue) {
  invariant(
    assignments.get(key) === expectedValue,
    `supabase/config.toml must set ${key} = ${expectedValue}`,
  )
}

function importNames(statement, sourceFile, expectedModule) {
  invariant(ts.isImportDeclaration(statement), 'tombstone must begin with imports')
  invariant(
    ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === expectedModule,
    `tombstone import must target ${expectedModule}`,
  )
  const clause = statement.importClause
  invariant(clause && !clause.name, 'tombstone imports must be named imports')
  invariant(
    clause.namedBindings && ts.isNamedImports(clause.namedBindings),
    'tombstone imports must use named bindings',
  )
  return clause.namedBindings.elements.map((element) => {
    invariant(!element.propertyName, 'tombstone imports must not alias bindings')
    invariant(ts.isIdentifier(element.name), 'tombstone import name must be an identifier')
    return element.name.text
  })
}

function isIdentifier(node, expectedName) {
  return ts.isIdentifier(node) && node.text === expectedName
}

function isString(node, expectedValue) {
  return ts.isStringLiteralLike(node) && node.text === expectedValue
}

function assertCall(node, functionName, expectedArgumentCount, label) {
  invariant(ts.isCallExpression(node), `${label} must be a call expression`)
  invariant(isIdentifier(node.expression, functionName), `${label} must call ${functionName}`)
  invariant(
    node.arguments.length === expectedArgumentCount,
    `${label} must pass exactly ${expectedArgumentCount} arguments`,
  )
  return node.arguments
}

function assertCanonicalMethodsStatement(statement, sourceFile) {
  invariant(ts.isVariableStatement(statement), 'tombstone must declare METHODS')
  invariant(
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0,
    'tombstone METHODS must be const',
  )
  invariant(
    statement.declarationList.declarations.length === 1,
    'tombstone must declare only METHODS',
  )

  const declaration = statement.declarationList.declarations[0]
  invariant(isIdentifier(declaration.name, 'METHODS'), 'tombstone must declare METHODS')
  invariant(
    declaration.initializer && ts.isAsExpression(declaration.initializer),
    'tombstone METHODS must use a const assertion',
  )
  invariant(
    declaration.initializer.type.getText(sourceFile) === 'const',
    'tombstone METHODS must use `as const`',
  )
  const methods = declaration.initializer.expression
  invariant(
    ts.isArrayLiteralExpression(methods)
      && methods.elements.length === 1
      && isString(methods.elements[0], 'POST'),
    'tombstone METHODS must contain only POST',
  )
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  return null
}

function assertCanonicalTombstone(functionName) {
  const relativePath = path.join('supabase', 'functions', functionName, 'index.ts')
  const absolutePath = path.join(REPOSITORY_ROOT, relativePath)
  invariant(existsSync(absolutePath), `${relativePath} is missing`)

  const source = readFileSync(absolutePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  )
  invariant(
    sourceFile.parseDiagnostics.length === 0,
    `${relativePath} contains TypeScript syntax errors`,
  )
  invariant(
    sourceFile.statements.length === 4,
    `${relativePath} must contain only two imports, METHODS, and serve(...)`,
  )

  const [serveImport, responseImport, methodsStatement, serveStatement] = sourceFile.statements
  assertExactSet(
    importNames(
      serveImport,
      sourceFile,
      'https://deno.land/std@0.168.0/http/server.ts',
    ),
    ['serve'],
    `${functionName} server import`,
  )
  assertExactSet(
    importNames(responseImport, sourceFile, '../_shared/workspaceAuth.ts'),
    ['jsonResponse', 'optionsResponse'],
    `${functionName} response import`,
  )
  assertCanonicalMethodsStatement(methodsStatement, sourceFile)

  invariant(
    ts.isExpressionStatement(serveStatement),
    `${relativePath} must end with serve(...)`,
  )
  const serveArguments = assertCall(
    serveStatement.expression,
    'serve',
    1,
    `${functionName} serve`,
  )
  const handler = serveArguments[0]
  invariant(ts.isArrowFunction(handler), `${functionName} handler must be an arrow function`)
  invariant(
    !handler.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword),
    `${functionName} tombstone handler must not be async`,
  )
  invariant(
    handler.parameters.length === 1
      && isIdentifier(handler.parameters[0].name, 'req')
      && !handler.parameters[0].initializer
      && !handler.parameters[0].dotDotDotToken,
    `${functionName} handler must accept only req`,
  )
  invariant(ts.isBlock(handler.body), `${functionName} handler must use a block body`)
  invariant(
    handler.body.statements.length === 2,
    `${functionName} handler must contain only OPTIONS and 410 returns`,
  )

  const [optionsStatement, goneStatement] = handler.body.statements
  invariant(ts.isIfStatement(optionsStatement), `${functionName} must handle OPTIONS first`)
  invariant(!optionsStatement.elseStatement, `${functionName} OPTIONS branch must not have else`)
  const condition = optionsStatement.expression
  invariant(
    ts.isBinaryExpression(condition)
      && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isPropertyAccessExpression(condition.left)
      && isIdentifier(condition.left.expression, 'req')
      && condition.left.name.text === 'method'
      && isString(condition.right, 'OPTIONS'),
    `${functionName} must compare req.method === 'OPTIONS'`,
  )
  invariant(
    ts.isReturnStatement(optionsStatement.thenStatement)
      && optionsStatement.thenStatement.expression,
    `${functionName} OPTIONS branch must return immediately`,
  )
  const optionsArguments = assertCall(
    optionsStatement.thenStatement.expression,
    'optionsResponse',
    2,
    `${functionName} OPTIONS response`,
  )
  invariant(
    isIdentifier(optionsArguments[0], 'req')
      && isIdentifier(optionsArguments[1], 'METHODS'),
    `${functionName} OPTIONS response must receive req and METHODS`,
  )

  invariant(
    ts.isReturnStatement(goneStatement) && goneStatement.expression,
    `${functionName} must end with a 410 return`,
  )
  const goneArguments = assertCall(
    goneStatement.expression,
    'jsonResponse',
    4,
    `${functionName} 410 response`,
  )
  invariant(
    isIdentifier(goneArguments[0], 'req')
      && isIdentifier(goneArguments[1], 'METHODS')
      && ts.isNumericLiteral(goneArguments[2])
      && goneArguments[2].text === '410',
    `${functionName} must return jsonResponse(req, METHODS, 410, ...)`,
  )

  const body = goneArguments[3]
  invariant(
    ts.isObjectLiteralExpression(body) && body.properties.length === 2,
    `${functionName} 410 body must contain only error and code`,
  )
  const bodyValues = new Map()
  for (const property of body.properties) {
    invariant(
      ts.isPropertyAssignment(property),
      `${functionName} 410 body must use property assignments`,
    )
    const name = propertyNameText(property.name)
    invariant(name === 'error' || name === 'code', `${functionName} has an unexpected 410 field`)
    invariant(!bodyValues.has(name), `${functionName} has a duplicate 410 field`)
    invariant(
      ts.isStringLiteralLike(property.initializer)
        && property.initializer.text.length > 0,
      `${functionName} ${name} must be a non-empty string`,
    )
    bodyValues.set(name, property.initializer.text)
  }
  invariant(bodyValues.has('error') && bodyValues.has('code'), `${functionName} needs error and code`)
  invariant(
    /^[A-Z][A-Z0-9_]*_DISABLED$/u.test(bodyValues.get('code')),
    `${functionName} code must be an uppercase *_DISABLED value`,
  )
}

function collectTypeScriptFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectTypeScriptFiles(target))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(target)
  }
  return sorted(files)
}

function assertEdgeTypeScriptSyntax() {
  const files = collectTypeScriptFiles(FUNCTIONS_ROOT)
  invariant(
    files.length === EXPECTED_COUNTS.edgeTypeScriptFiles,
    `expected ${EXPECTED_COUNTS.edgeTypeScriptFiles} Edge TypeScript files; received ${files.length}`,
  )

  const failures = []
  for (const file of files) {
    const result = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    })
    const diagnostics = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
    for (const diagnostic of diagnostics) {
      failures.push(
        `${path.relative(REPOSITORY_ROOT, file)}: ${ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n',
        )}`,
      )
    }
  }
  invariant(
    failures.length === 0,
    `Edge TypeScript syntax failed:\n${failures.join('\n')}`,
  )
  return files.length
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  invariant(
    manifest.release === 'invite-only-workspace-mvp',
    'manifest release must be invite-only-workspace-mvp',
  )
  invariant(
    manifest.scope === 'Every changed or new Supabase Edge Function relative to base_commit',
    'manifest scope is not the reviewed release scope',
  )
  invariant(
    typeof manifest.base_commit === 'string' && COMMIT_PATTERN.test(manifest.base_commit),
    'manifest base_commit must be a lowercase 40-character commit SHA',
  )
  invariant(
    manifest.base_commit === EXPECTED_RELEASE_BASE_COMMIT,
    `manifest base_commit must remain the canonical release baseline ${EXPECTED_RELEASE_BASE_COMMIT}`,
  )
  invariant(
    gitText(['cat-file', '-t', manifest.base_commit]) === 'commit',
    'manifest base_commit is not available as a commit',
  )
  assertCommitIsAncestor(
    manifest.base_commit,
    'HEAD',
    'manifest base_commit must be an ancestor of HEAD',
  )

  const expectedBase = process.env.INVITE_ONLY_EXPECTED_BASE_SHA?.trim()
  if (process.env.CI === 'true') {
    invariant(expectedBase, 'CI must provide INVITE_ONLY_EXPECTED_BASE_SHA')
  }
  if (expectedBase) {
    invariant(COMMIT_PATTERN.test(expectedBase), 'expected PR base must be a commit SHA')
    invariant(
      gitText(['cat-file', '-t', expectedBase]) === 'commit',
      'pull request base SHA is not available as a commit',
    )
    assertCommitIsAncestor(
      manifest.base_commit,
      expectedBase,
      'manifest base_commit must be an ancestor of the pull request base SHA',
    )
    assertCommitIsAncestor(
      expectedBase,
      'HEAD',
      'pull request base SHA must be an ancestor of HEAD',
    )
  }

  invariant(
    manifest.expected_unique_function_count === EXPECTED_COUNTS.changedFunctions,
    `manifest expected_unique_function_count must be ${EXPECTED_COUNTS.changedFunctions}`,
  )
  invariant(
    manifest.expected_deploy_count === EXPECTED_COUNTS.deployedFunctions,
    `manifest expected_deploy_count must be ${EXPECTED_COUNTS.deployedFunctions}`,
  )

  invariant(
    manifest.phases && typeof manifest.phases === 'object' && !Array.isArray(manifest.phases),
    'manifest phases must be an object',
  )
  assertExactSet(Object.keys(manifest.phases), EXPECTED_PHASE_KEYS, 'manifest phase keys')
  const phase1 = stringArray(
    manifest.phases[EXPECTED_PHASE_KEYS[0]],
    `manifest phases.${EXPECTED_PHASE_KEYS[0]}`,
  )
  const phase2 = stringArray(
    manifest.phases[EXPECTED_PHASE_KEYS[1]],
    `manifest phases.${EXPECTED_PHASE_KEYS[1]}`,
  )
  const phase3 = stringArray(
    manifest.phases[EXPECTED_PHASE_KEYS[2]],
    `manifest phases.${EXPECTED_PHASE_KEYS[2]}`,
  )
  const deployedFunctions = [...phase1, ...phase2, ...phase3]
  invariant(
    new Set(deployedFunctions).size === deployedFunctions.length,
    'a function may appear in only one deployment phase',
  )
  invariant(
    deployedFunctions.length === EXPECTED_COUNTS.deployedFunctions,
    `deployment phases must contain ${EXPECTED_COUNTS.deployedFunctions} functions`,
  )
  assertExactSet(phase1, EXPECTED_RETIRED_FUNCTIONS, 'phase 1 tombstones')
  assertExactSet(phase2, EXPECTED_FAIL_CLOSED_PHASE, 'phase 2 fail-closed handlers')

  const retiredFunctions = stringArray(
    manifest.retired_http_410_functions,
    'manifest retired_http_410_functions',
  )
  invariant(
    retiredFunctions.length === EXPECTED_COUNTS.retiredFunctions,
    `manifest must contain ${EXPECTED_COUNTS.retiredFunctions} retired functions`,
  )
  assertExactSet(retiredFunctions, EXPECTED_RETIRED_FUNCTIONS, 'retired functions')
  assertExactSet(retiredFunctions, phase1, 'retired functions and phase 1')

  const unauthenticatedTombstones = stringArray(
    manifest.unauthenticated_tombstone_probes,
    'manifest unauthenticated_tombstone_probes',
  )
  invariant(
    unauthenticatedTombstones.length === EXPECTED_COUNTS.unauthenticatedTombstones,
    `manifest must contain ${EXPECTED_COUNTS.unauthenticatedTombstones} unauthenticated tombstones`,
  )
  assertExactSet(
    unauthenticatedTombstones,
    EXPECTED_UNAUTHENTICATED_TOMBSTONES,
    'unauthenticated tombstones',
  )
  invariant(
    unauthenticatedTombstones.every((name) => retiredFunctions.includes(name)),
    'every unauthenticated tombstone must be retired',
  )

  invariant(
    Array.isArray(manifest.excluded_from_tenant_environment),
    'manifest exclusions must be an array',
  )
  invariant(
    manifest.excluded_from_tenant_environment.length === EXPECTED_COUNTS.excludedFunctions,
    `manifest must contain ${EXPECTED_COUNTS.excludedFunctions} exclusions`,
  )
  const excludedFunctions = manifest.excluded_from_tenant_environment.map((entry) => {
    invariant(entry && typeof entry === 'object', 'each manifest exclusion must be an object')
    invariant(
      typeof entry.name === 'string' && FUNCTION_NAME_PATTERN.test(entry.name),
      'each manifest exclusion needs a canonical name',
    )
    invariant(
      typeof entry.reason === 'string' && entry.reason.trim().length > 0,
      `${entry.name} exclusion needs a reason`,
    )
    invariant(
      typeof entry.tenant_remote_action === 'string'
        && entry.tenant_remote_action.trim().length > 0,
      `${entry.name} exclusion needs a tenant_remote_action`,
    )
    return entry.name
  })
  invariant(
    new Set(excludedFunctions).size === excludedFunctions.length,
    'manifest exclusions must not contain duplicates',
  )
  assertExactSet(excludedFunctions, EXPECTED_EXCLUDED_FUNCTIONS, 'excluded functions')
  invariant(
    excludedFunctions.every((name) => !deployedFunctions.includes(name)),
    'excluded functions must not appear in a deployment phase',
  )

  const diffOutput = gitBuffer([
    'diff',
    '--no-renames',
    '--name-only',
    '--diff-filter=ACMRD',
    '-z',
    `${manifest.base_commit}...HEAD`,
    '--',
    'supabase/functions',
  ])
  const changedFunctionDirectories = new Set()
  const deletedEntrypointDirectories = new Set()
  for (const changedPath of diffOutput.toString('utf8').split('\0').filter(Boolean)) {
    const segments = changedPath.split('/')
    if (segments.length >= 3 && segments[2] !== '_shared') {
      changedFunctionDirectories.add(segments[2])
    }
  }
  const deletedOutput = gitBuffer([
    'diff',
    '--no-renames',
    '--name-only',
    '--diff-filter=D',
    '-z',
    `${manifest.base_commit}...HEAD`,
    '--',
    'supabase/functions',
  ])
  for (const deletedPath of deletedOutput.toString('utf8').split('\0').filter(Boolean)) {
    const segments = deletedPath.split('/')
    if (
      segments.length === 4
      && segments[0] === 'supabase'
      && segments[1] === 'functions'
      && segments[2] !== '_shared'
      && segments[3] === 'index.ts'
    ) {
      deletedEntrypointDirectories.add(segments[2])
    }
  }
  invariant(
    deletedEntrypointDirectories.size === 0,
    'Edge Function entrypoints may not be deleted in this release; retain a canonical tombstone and classify it as retired before remote removal',
  )
  invariant(
    changedFunctionDirectories.size === EXPECTED_COUNTS.changedFunctions,
    `expected ${EXPECTED_COUNTS.changedFunctions} changed function directories; received ${changedFunctionDirectories.size}`,
  )
  assertExactSet(
    changedFunctionDirectories,
    [...deployedFunctions, ...excludedFunctions],
    'manifest coverage of changed functions',
  )

  for (const functionName of [...deployedFunctions, ...excludedFunctions]) {
    const entrypoint = path.join(FUNCTIONS_ROOT, functionName, 'index.ts')
    invariant(existsSync(entrypoint), `${functionName} must have an index.ts entrypoint`)
  }

  const config = parseTomlAssignments(readFileSync(CONFIG_PATH, 'utf8'))
  assertConfigValue(config, 'auth.enable_signup', 'false')
  assertConfigValue(config, 'auth.enable_anonymous_sign_ins', 'false')
  assertConfigValue(config, 'auth.minimum_password_length', '12')
  assertConfigValue(
    config,
    'auth.password_requirements',
    '"lower_upper_letters_digits_symbols"',
  )
  assertConfigValue(config, 'auth.email.enable_signup', 'false')
  assertConfigValue(config, 'auth.email.otp_expiry', '86400')

  for (const functionName of unauthenticatedTombstones) {
    assertConfigValue(config, `functions.${functionName}.verify_jwt`, 'false')
  }
  const retiredWithJwtDisabled = retiredFunctions.filter(
    (functionName) => config.get(`functions.${functionName}.verify_jwt`) === 'false',
  )
  assertExactSet(
    retiredWithJwtDisabled,
    unauthenticatedTombstones,
    'retired functions with JWT verification disabled',
  )
  for (const functionName of EXPECTED_PUBLIC_NON_JWT_FUNCTIONS) {
    assertConfigValue(config, `functions.${functionName}.verify_jwt`, 'false')
  }
  const allJwtDisabledFunctions = []
  for (const [key, value] of config.entries()) {
    const match = key.match(/^functions\.([a-z0-9-]+)\.verify_jwt$/u)
    if (match && value === 'false') allJwtDisabledFunctions.push(match[1])
  }
  assertExactSet(
    allJwtDisabledFunctions,
    [...unauthenticatedTombstones, ...EXPECTED_PUBLIC_NON_JWT_FUNCTIONS],
    'functions with JWT verification disabled',
  )
  for (const functionName of EXPECTED_EXPLICIT_JWT_FUNCTIONS) {
    assertConfigValue(config, `functions.${functionName}.verify_jwt`, 'true')
  }
  for (const functionName of excludedFunctions) {
    assertConfigValue(config, `functions.${functionName}.verify_jwt`, 'true')
  }

  for (const functionName of retiredFunctions) assertCanonicalTombstone(functionName)
  const edgeTypeScriptFileCount = assertEdgeTypeScriptSyntax()

  process.stdout.write('invite-only release verification passed\n')
  process.stdout.write(
    `manifest_functions=${changedFunctionDirectories.size} deploy=${deployedFunctions.length} retired=${retiredFunctions.length} excluded=${excludedFunctions.length}\n`,
  )
  process.stdout.write(`edge_typescript_files=${edgeTypeScriptFileCount} syntax_failures=0\n`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown verification failure'
  process.stderr.write(`invite-only release verification failed: ${message}\n`)
  process.exitCode = 1
}
