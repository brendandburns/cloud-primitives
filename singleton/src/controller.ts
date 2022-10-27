import { AppsV1Api, CoreV1Api, CustomObjectsApi, KubeConfig, V1Deployment, V1DeploymentList } from '@kubernetes/client-node'
import { Singleton, SingletonList } from './singleton.js';

export class SingletonController {
    private readonly coreApi: CoreV1Api;
    private readonly appsApi: AppsV1Api;
    private readonly customApi: CustomObjectsApi;

    constructor(kc: KubeConfig) {
        this.coreApi = kc.makeApiClient(CoreV1Api);
        this.appsApi = kc.makeApiClient(AppsV1Api);
        this.customApi = kc.makeApiClient(CustomObjectsApi);   
    }

    async sync() {
        const res = await this.coreApi.listNamespace();
        for (const namespace of res.body.items) {
            await this.reconcileNamespace(namespace.metadata.name);
        }    
    }

    async reconcileNamespace(namespace: string) {
        const res = await this.customApi.listNamespacedCustomObject("metaparticle.io", "v1beta1", namespace, "singletons");
        const list = res.body as SingletonList;
    
        const deployments = (await this.appsApi.listNamespacedDeployment(namespace)).body;
        for (const singleton of list.items) {
            await this.reconcileDeployments(deployments, singleton);
        }
        await this.maybeDeleteDeployments(deployments, list);
    }
    
    async updateDeployment(s: Singleton, d: V1Deployment): Promise<V1Deployment> {
        // TODO: handle multi-container singletons
        if (d.spec.template.spec.containers[0].image !== s.spec.image) {
            d.spec.template.spec.containers[0].image = s.spec.image;
            return (await this.appsApi.replaceNamespacedDeployment(d.metadata.name, d.metadata.namespace, d)).body;
        }
        return d;
    }
    
    async createDeployment(s: Singleton): Promise<V1Deployment> {
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
        const res = await this.appsApi.createNamespacedDeployment(s.metadata.namespace, d);
        console.log(`Created deployment for singleton ${s.metadata.name}`);
        return res.body;
    }
    
    async reconcileDeployments(deployments: V1DeploymentList, singleton: Singleton): Promise<V1DeploymentList> {
        var found = false;
        for (const deployment of deployments.items) {
            if (deployment.metadata.name === singleton.metadata.name) {
                found = true;
                await this.updateDeployment(singleton, deployment);
            }
        }
        if (!found) {
            await this.createDeployment(singleton);
        }
        return deployments
    }
    
    async maybeDeleteDeployments(deployments: V1DeploymentList, singletons: SingletonList): Promise<void> {
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
                await this.appsApi.deleteNamespacedDeployment(deployment.metadata.name, deployment.metadata.namespace);
            }
        }
    }    
}