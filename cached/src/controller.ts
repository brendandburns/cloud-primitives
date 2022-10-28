import { AppsV1Api, CoreV1Api, CustomObjectsApi, KubeConfig, V1Deployment, V1DeploymentList } from '@kubernetes/client-node'
import { Cached, CachedList } from './cached.js';

export class CachedController {
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
        const res = await this.customApi.listNamespacedCustomObject("metaparticle.io", "v1beta1", namespace, "cached");
        const list = res.body as CachedList;
    
        const deployments = (await this.appsApi.listNamespacedDeployment(namespace)).body;
        for (const cached of list.items) {
            await this.reconcileDeployments(deployments, cached);
        }
        await this.maybeDeleteDeployments(deployments, list);
    }
    
    async updateDeployment(s: Cached, d: V1Deployment): Promise<V1Deployment> {
        return d;
    }
    
    async createDeployment(s: Cached): Promise<V1Deployment> {
        const label = `${s.metadata.name}-cached`;
        const d: V1Deployment = {
            metadata: {
                namespace: s.metadata.namespace,
                name: s.metadata.name,
                labels: {
                    'cached.metaparticle.io': 'true'
                }
            },
            spec: {
                selector: {
                    matchLabels: {
                        app: label
                    }
                },
                replicas: 4,
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
                                name: 'cache',
                                image: 'memcached'
                            }
                        ]
                    }
                }
            }
        }
        const res = await this.appsApi.createNamespacedDeployment(s.metadata.namespace, d);
        console.log(`Created deployment for cached ${s.metadata.name}`);
        return res.body;
    }
    
    async reconcileDeployments(deployments: V1DeploymentList, cache: Cached): Promise<V1DeploymentList> {
        var found = false;
        for (const deployment of deployments.items) {
            if (deployment.metadata.name === cache.metadata.name) {
                found = true;
                await this.updateDeployment(cache, deployment);
            }
        }
        if (!found) {
            await this.createDeployment(cache);
        }
        return deployments
    }
    
    async maybeDeleteDeployments(deployments: V1DeploymentList, cached: CachedList): Promise<void> {
        for (const deployment of deployments.items) {
            if (!deployment.metadata.labels || deployment.metadata.labels['cached.metaparticle.io'] !== 'true') {
                continue;
            }
            var found: boolean = false;
            for (const cache of cached.items) {
                if (cache.metadata.name === deployment.metadata.name) {
                    found = true;
                }
            }
            if (!found) {
                console.log(`Deleting deployment for non-existent cached ${deployment.metadata.name}`);
                await this.appsApi.deleteNamespacedDeployment(deployment.metadata.name, deployment.metadata.namespace);
            }
        }
    }    
}