Forked version of v12.x to support streams.

# Main Idea

Use event/result of custom runtime as stream, to handle event/result in sync and reduce integration time of large payloads.

## AWS Lambda Custom Runtimes

```javascript
const handler => event => ({ statusCode: 200, body: 'your data here' });
const _API = 'http://' + AWS_LAMBDA_RUNTIME_API + '/2018-06-01/runtime/invocation/';

while(true) {
  const {
    body,
    headers: { ['Lambda-Runtime-Aws-Request-Id']: requestId }
  } = await get(_API + 'next');

  const result = await handler(body);
  await post(
    _API + requestId + '/response'
    JSON.stringify(result);
  );
}
```

## This bootstrap


Instead of `await`, we `stream`

```javascript
while(true) {
  const response = get(_API + 'next');
  const result = handler(response);

  // header resolve before body
  const { ['Lambda-Runtime-Aws-Request-Id']: requestId } = await response.headers;

  post(_API + requestId + 'response')
    .pipe(result);
}
```

## Problems

* `/next`|`/response` streams JSON, then we can't really get any benefit of this, [what if...](https://github.com/dominictarr/JSONStream) :-P
* We can't run multiple events at same;

## Conclusion

I couldn't make it work as expected but could separate 'bootstrap.js' from layer. =)

AWS could offer other options like GRPC.

## TODO

* Benchmark test;
* Test with different events types (not only API-Gateway);
