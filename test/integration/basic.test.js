import BeanstalkdProxy from '../../src/index';
import BeanstalkdClient from 'beanstalkd';
import Promise from 'bluebird';
import expect from 'unexpected';

describe('basic / single upstream', function () {
  before(function () {
    this.proxy = new BeanstalkdProxy(`${process.env.BEANSTALKD_A_PORT_11300_TCP_ADDR}:${process.env.BEANSTALKD_A_PORT_11300_TCP_PORT}`);

    return this.proxy.listen(11300);
  });

  after(function () {
    return this.proxy.close();
  });

  beforeEach(function () {
    this.client = new BeanstalkdClient();
    return this.client.connect();
  });

  afterEach(function () {
    return this.client.quit();
  });

  it('proxies use commands', function () {
    let tube = Math.random().toString();
    return this.client.use(tube).then(() => {
      return expect(this.client.listTubeUsed(), 'to be fulfilled with', tube);
    });
  });

  it('proxies watch/ignore', function () {
    let tube = "ABC"+Math.random().toString();
    return this.client.watch(tube).then(() => {
      return this.client.ignore('default');
    }).then(() => {
      return expect(this.client.listTubesWatched(), 'to be fulfilled with', [tube]);
    });
  });

  it('chains multiple proxies', function () {
    let tube = Math.random().toString();
    let proxyB = new BeanstalkdProxy('localhost:11300');
    let proxyC = new BeanstalkdProxy('localhost:11301');
    let client = new BeanstalkdClient('localhost', 11302);

    return Promise.join(
      proxyB.listen(11301),
      proxyC.listen(11302)
    ).then(function () {
      return client.connect();
    }).then(function () {
      return client.use(tube).then(() => {
        return expect(client.listTubeUsed(), 'to be fulfilled with', tube);
      });
    }).finally(function () {
      return Promise.join(
        proxyB.close(),
        proxyC.close(),
        client.quit()
      );
    });
  });

  it('handles bad upstream', function () {
    const proxy = new BeanstalkdProxy(`${process.env.BEANSTALKD_A_PORT_11300_TCP_ADDR}:9999`);
    const client = new BeanstalkdClient('localhost', 11301);

    return proxy.listen(11301).then(() => {
      return client.connect().then(() => Promise.delay(50));
    }).then(() => {
      return expect(client.use('random'), 'to be rejected with', 'UPSTREAM_UNAVAILABLE');
    }).finally(() => {
      return proxy.close();
    });
  });
});
