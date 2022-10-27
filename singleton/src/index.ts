import * as k8s from '@kubernetes/client-node';
import { UPDATE, V1Deployment, V1DeploymentList } from '@kubernetes/client-node';
import { create } from 'domain';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

interface SingletonSpec {
    image: string;
}

interface Singleton {
    metadata: k8s.V1ObjectMeta;
    spec: SingletonSpec;
}

interface SingletonList {
    items: Singleton[];
}

const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sApi = kc.makeApiClient(k8s.ApiextensionsV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const customAPI = kc.makeApiClient(k8s.CustomObjectsApi);

const poll = async() => {
    const res = await coreApi.listNamespace();
    for (const namespace of res.body.items) {
        await pollNamespace(namespace.metadata.name);
    }
    setTimeout(poll, 1000);
}

const pollNamespace = async (namespace: string) => {
    const res = await customAPI.listNamespacedCustomObject("metaparticle.io", "v1beta1", namespace, "singletons");
    const list = res.body as SingletonList;

    const deployments = (await appsApi.listNamespacedDeployment(namespace)).body;
    for (const singleton of list.items) {
        await reconcile(deployments, singleton);
    }
    await maybeDelete(deployments, list);
}

const updateDeployment = async (s: Singleton, d: V1Deployment) => {
    // TODO: handle multi-container singletons
    if (d.spec.template.spec.containers[0].image !== s.spec.image) {
        d.spec.template.spec.containers[0].image = s.spec.image;
        await appsApi.replaceNamespacedDeployment(d.metadata.name, d.metadata.namespace, d);
    }
}

const createDeployment = async(s: Singleton) => {
    const label = `${s.metadata.name}-singleton`;
    const d: V1Deployment = {
        metadata: {
            namespace: s.metadata.namespace,
            name: s.metadata.name,
            labels: {
                'singleton.metaparticle.io': 'true'
            }
        },
        spec: {
            selector: {
                matchLabels: {
                    app: label
                }
            },
            replicas: 1,
            strategy: {
                type: "RollingUpdate",
                rollingUpdate: {
                  maxSurge: 1,
                  maxUnavailable: "100%"
                }
            },
            template: {
                metadata: {
                    labels: {
                        app: label
                    }
                },
                spec: {
                    containers: [
                        {
                            name: 'singleton',
                            image: s.spec.image
                        }
                    ]
                }
            }
        }
    }
    const res = await appsApi.createNamespacedDeployment(s.metadata.namespace, d);
    console.log(`Created deployment for singleton ${s.metadata.name}`);
}

const reconcile = async (deployments: V1DeploymentList, singleton: Singleton) => {
    var found = false;
    for (const deployment of deployments.items) {
        if (deployment.metadata.name === singleton.metadata.name) {
            found = true;
            await updateDeployment(singleton, deployment);
        }
    }
    if (!found) {
        await createDeployment(singleton);
    }
    return deployments
}

const maybeDelete = async (deployments: V1DeploymentList, singletons: SingletonList) => {
    for (const deployment of deployments.items) {
        if (!deployment.metadata.labels || deployment.metadata.labels['singleton.metaparticle.io'] !== 'true') {
            continue;
        }
        var found: boolean = false;
        for (const singleton of singletons.items) {
            if (singleton.metadata.name === deployment.metadata.name) {
                found = true;
            }
        }
        if (!found) {
            console.log(`Deleting deployment for non-existent singleton ${deployment.metadata.name}`);
            await appsApi.deleteNamespacedDeployment(deployment.metadata.name, deployment.metadata.namespace);
        }
    }
}

const fun = async () => {
    const name = "singletons.metaparticle.io";
    const res = await k8sApi.listCustomResourceDefinition();
    var found = false;
    res.body.items.forEach(element => {
        if (element.metadata.name === name) {
            found = true;
        }
    });
    if (found) {
        return;
    }
    console.log("Failed to find CRD for Singletons, creating.");

    const crd = await k8sApi.createCustomResourceDefinition({
        metadata: {
            name: name
        },
        spec: {
            group: "metaparticle.io",
            names: {
                kind: "singleton",
                plural: "singletons"
            },
            versions: [{
                name: "v1beta1",
                served: true,
                storage: true,
                schema: {
                    openAPIV3Schema: {
                        type: "object",
                        properties: {
                          spec: {
                            type: "object",
                            properties: {
                                image: {
                                    type: "string"
                                }
                            }
                          }
                        }
                    } as k8s.V1JSONSchemaProps
                }
            }],
            scope: "Namespaced",
        }
    });

    console.log(crd.body);
}

fun().then(poll);

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