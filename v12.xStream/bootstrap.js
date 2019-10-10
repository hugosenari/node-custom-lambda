const http = require('http');

const RUNTIME_PATH = '/2018-06-01/runtime'

// eslint-disable-next-line no-undef
const { env, exit } = process;

const {
  LAMBDA_TASK_ROOT,
  AWS_LAMBDA_RUNTIME_API
} = env;

const [HOST, PORT] = AWS_LAMBDA_RUNTIME_API.split(':');

async function startHandling() {
  const { mainloop } = require(`${LAMBDA_TASK_ROOT}/bootstrap`);

  if (mainloop == null) await initError(
    new Error(`/bootstrap.js with exports.mainloop missing on '${LAMBDA_TASK_ROOT}'`)
  );
  else if (typeof mainloop !== 'function') await initError(
    new Error(`Mainloop from '{ mainloop } = require("${LAMBDA_TASK_ROOT}/bootstrap")' is not a function`)
  );
  else await mainloop();
}

async function initError(err) {
  const lambdaErr = toLambdaErr(err)
  await request({
    method: 'POST',
    path: `${RUNTIME_PATH}/init/error`,
    headers: {
      'Content-Type': 'application/json',
      'Lambda-Runtime-Function-Error-Type': lambdaErr.errorType,
    },
    body: JSON.stringify(lambdaErr),
  });
}

function request(options) {
  options.host = HOST
  options.port = PORT

  return new Promise((resolve, reject) => {
    let req = http.request(options, res => {
      let bufs = []
      res.on('data', data => bufs.push(data))
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        // eslint-disable-next-line no-undef
        body: Buffer.concat(bufs).toString(),
      }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(options.body)
  })
}

function toLambdaErr(err) {
  const { name, message, stack } = err
  return {
    errorType: name || typeof err,
    errorMessage: message || ('' + err),
    stackTrace: (stack || '').split('\n').slice(1),
  }
}

async function start() {
  try {
    await startHandling();
  } catch(err) {
    initError(err);
    exit(1);
  }
}

start();
