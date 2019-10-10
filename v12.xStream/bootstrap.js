const http = require('http')

const RUNTIME_PATH = '/2018-06-01/runtime'

const CALLBACK_USED = Symbol('CALLBACK_USED')

const {
  AWS_LAMBDA_FUNCTION_NAME,
  AWS_LAMBDA_FUNCTION_VERSION,
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
  AWS_LAMBDA_LOG_GROUP_NAME,
  AWS_LAMBDA_LOG_STREAM_NAME,
  LAMBDA_TASK_ROOT,
  _HANDLER,
  AWS_LAMBDA_RUNTIME_API,
} = process.env

const [HOST, PORT] = AWS_LAMBDA_RUNTIME_API.split(':')

start()

async function start() {
  try {
    await processEvents(getHandler())
  } catch (e) {
    await postError(`${RUNTIME_PATH}/init/error`, e);
    return process.exit(1)
  }
}

async function processEvents(handler) {
  while (true) {
    const { event, context } = await nextInvocation()
    let result
    try {
      result = await handler(event, context)
      await invokeResponse(result, context)
    } catch (e) {
      await postError(`${RUNTIME_PATH}/invocation/${context.awsRequestId}/error`, e)
    }
  }
}

async function nextInvocation() {
  const res = await request({ path: `${RUNTIME_PATH}/invocation/next`, method: 'GET' })

  if (res.statusCode !== 200)
    throw new Error(`Unexpected /invocation/next response: ${JSON.stringify(res)}`)

  if (res.headers['lambda-runtime-trace-id'])
    process.env._X_AMZN_TRACE_ID = res.headers['lambda-runtime-trace-id']
  else
    delete process.env._X_AMZN_TRACE_ID

  const deadlineMs = +res.headers['lambda-runtime-deadline-ms']

  const context = {
    awsRequestId: res.headers['lambda-runtime-aws-request-id'],
    invokedFunctionArn: res.headers['lambda-runtime-invoked-function-arn'],
    logGroupName: AWS_LAMBDA_LOG_GROUP_NAME,
    logStreamName: AWS_LAMBDA_LOG_STREAM_NAME,
    functionName: AWS_LAMBDA_FUNCTION_NAME,
    functionVersion: AWS_LAMBDA_FUNCTION_VERSION,
    memoryLimitInMB: AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    getRemainingTimeInMillis: () => deadlineMs - Date.now(),
    callbackWaitsForEmptyEventLoop: true,
  }

  if (res.headers['lambda-runtime-client-context'])
    context.clientContext = JSON.parse(res.headers['lambda-runtime-client-context'])

  if (res.headers['lambda-runtime-cognito-identity'])
    context.identity = JSON.parse(res.headers['lambda-runtime-cognito-identity'])

  return { event: res, context }
}

function isFunction(fn = null) {
  if (fn && fn.constructor === Function)
    return fn
}

function isStream(obj = null) {
  if (obj && isFunction(obj.pipe) && isFunction(obj.on))
    return obj
}

async function invokeResponse(body, context = {}) {
  const res = await request({
    body: isStrem(body) || JSON.stringify(body || null),
    path: `${RUNTIME_PATH}/invocation/${context.awsRequestId}/response`
  })
  if (res.statusCode !== 202)
    throw new Error(`Unexpected /invocation/response response: ${JSON.stringify(res)}`)
  //TODO: check if is required
  await new Promise(resolve => res.on('end', resolve));
}

async function postError(path, err) {
  const lambdaErr = toLambdaErr(err)
  const body = JSON.stringify(lambdaErr);
  const res = await request({
    body,
    path,
    headers: {
      'Content-Type': 'application/json',
      'Lambda-Runtime-Function-Error-Type': lambdaErr.errorType,
    },
  })
  if (res.statusCode !== 202)
    throw new Error(`Unexpected ${path} response: ${JSON.stringify(res)}`)
  //TODO: check if is required
  await new Promise(resolve => res.on('end', resolve));
}

function getHandler() {
  const appParts = _HANDLER.split('.')

  if (appParts.length !== 2)
    throw new Error(`Bad handler ${_HANDLER}`)

  const [modulePath, handlerName] = appParts

  // Let any errors here be thrown as-is to aid debugging
  const { [handlerName]: userHandler } = require(LAMBDA_TASK_ROOT + '/' + modulePath)

  if (userHandler == null)
    throw new Error(`Handler '${handlerName}' missing on module '${modulePath}'`)
  else if (typeof userHandler !== 'function')
    throw new Error(`Handler '${handlerName}' from '${modulePath}' is not a function`)

  return userHandler
}

function request(options) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      method: 'POST',
      ...options,
      host: HOST,
      port: PORT,
    }, resolve)
    request.on('error', reject)
    request.end(options.body)
  })
}

function toLambdaErr(err) {
  const {
    name = typeof err,
    message = ('' + err),
    stack = ''
  } = err
  return {
    errorType: name,
    errorMessage: message,
    stackTrace: stack.split('\n').slice(1),
  }
}
