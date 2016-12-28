# node-beanstalkd-proxy

Protocol aware beanstalkd proxy in node for sharding, authentication usecases.

```
npm install --save beanstalkd-proxy
```

```js
import BeanstalkdProxy from 'beanstalkd-proxy';

const proxy = new BeanstalkdProxy('upstream_host:11300');

proxy.listen(11300);
```

## Handling upstream unavailability

Since the proxy server will accept incoming connections regardless of the current upstream status the Beanstalkd client must issue a command after connnecting if it wants to be sure it's currently connected to live upstreams.
