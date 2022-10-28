import { AppsV1Api, CoreV1Api, CustomObjectsApi, KubeConfig, KubernetesListObject, KubernetesObject, V1Deployment, V1DeploymentList, V1Service, V1ServiceList, V1Status } from '@kubernetes/client-node'
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
        const services = (await this.coreApi.listNamespacedService(namespace)).body;
        // TODO: this is O(n^2) but it could be O(n) via a hashtable
        for (const cached of list.items) {
            await this.reconcileDeployments(deployments, cached);
            await this.reconcileServices(services, cached);
        }
        await this.maybeDeleteDeployments(deployments, list);
        await this.maybeDeleteServices(services, list);
    }

    async updateService(c: Cached, s: V1Service): Promise<V1Service> {
        return s;
    }
    
    async createService(c: Cached): Promise<V1Service> {
        const label = `${c.metadata.name}-cached`;
        const s: V1Service = {
            metadata: {
                namespace: c.metadata.namespace,
                name: c.metadata.name,
                labels: {
                    'cached.metaparticle.io': 'true'
                }
            },
            spec: {
                selector: {
                    app: label
                },
                ports: [
                    {
                        name: 'port',
                        port: 8080,
                        protocol: 'TCP',
                        targetPort: 8080
                    }   
                ]
            }
        }
        const res = await this.coreApi.createNamespacedService(c.metadata.namespace, s);
        console.log(`Created service for cached ${c.metadata.name}`);
        return res.body;
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
        return await this.reconcileList(deployments, cache, this.updateDeployment.bind(this), this.createDeployment.bind(this));
    }

    async reconcileServices(services: V1ServiceList, cache: Cached): Promise<V1ServiceList> {
        return await this.reconcileList(services, cache, this.updateService.bind(this), this.createService.bind(this));
    }

    async reconcileList<T extends KubernetesObject>(
        list: KubernetesListObject<T>, cache: Cached,
        update: (cache: Cached, obj: T) => Promise<T>,
        create: (cache: Cached) => Promise<T>): Promise<KubernetesListObject<T>> {
        var found = false;
        for (const obj of list.items) {
            if (obj.metadata.name === cache.metadata.name) {
                found = true;
                await update(cache, obj);
            }
        }
        if (!found) {
            await create(cache);
        }
        return list;
    }
    
    async maybeDeleteDeployments(deployments: V1DeploymentList, cached: CachedList): Promise<void> {
        await this.maybeDeleteList(deployments, cached, async (name: string, ns: string) => {
            await this.appsApi.deleteNamespacedDeployment(name, ns);
        });
    }

    async maybeDeleteServices(services: V1ServiceList, cached: CachedList): Promise<void> {
        await this.maybeDeleteList(services, cached, async (name: string, ns: string) => {
            await this.coreApi.deleteNamespacedService(name, ns);
        });
    }

    async maybeDeleteList<T extends KubernetesObject>(
        list: KubernetesListObject<T>, cached: CachedList,
        del: (name: string, namespace: string) => Promise<void>): Promise<void> {
        for (const obj of list.items) {
            if (!obj.metadata.labels || obj.metadata.labels['cached.metaparticle.io'] !== 'true') {
                continue;
            }
            var found: boolean = false;
            for (const cache of cached.items) {
                if (cache.metadata.name === obj.metadata.name) {
                    found = true;
                }
            }
            if (!found) {
                console.log(`Deleting object for non-existent cached ${obj.metadata.name}`);
                await del(obj.metadata.name, obj.metadata.namespace)
            }
        }
    }    
}