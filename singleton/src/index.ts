import { KubeConfig } from '@kubernetes/client-node';
import { SingletonController } from './controller.js';
import { CustomObjectManager } from './crd.js';

const kc = new KubeConfig();
kc.loadFromDefault();

const controller = new SingletonController(kc);
const manager = new CustomObjectManager(kc);

const poll = async() => {
    await controller.sync();
    setTimeout(poll, 1000);
}

manager.createSingletonApi().then(poll);

/*
const listFn = () => k8sApi.listNamespacedPod('default');

const informer = k8s.makeInformer(kc, '/api/v1/namespaces/default/pods', listFn);

informer.on('add', (obj: k8s.V1Pod) => { console.log(`Added: ${obj.metadata!.name}`); });
informer.on('update', (obj: k8s.V1Pod) => { console.log(`Updated: ${obj.metadata!.name}`); });
informer.on('delete', (obj: k8s.V1Pod) => { console.log(`Deleted: ${obj.metadata!.name}`); });
informer.on('error', (err: k8s.V1Pod) => {
  console.error(err);
  // Restart informer after 5sec
  setTimeout(() => {
    informer.start();
  }, 5000);
});

informer.start();
*/