import { KubeConfig } from '@kubernetes/client-node';
import { CachedController } from './controller.js';
import { CachedManager } from './crd.js';

const kc = new KubeConfig();
kc.loadFromDefault();

const manager = new CachedManager(kc);
const controller = new CachedController(kc);

const poll = async() => {
    await controller.sync();
    setTimeout(poll, 1000);
}

manager.createCachedApi().then(poll);
