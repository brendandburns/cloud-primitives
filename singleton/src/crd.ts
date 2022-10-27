import { ApiextensionsV1Api, KubeConfig, V1JSONSchemaProps } from "@kubernetes/client-node";

export class CustomObjectManager {
    private readonly extensionsApi: ApiextensionsV1Api;

    constructor(kc: KubeConfig) {
        this.extensionsApi = kc.makeApiClient(ApiextensionsV1Api);
    }

    async createSingletonApi() {
        const name = "singletons.metaparticle.io";
        const res = await this.extensionsApi.listCustomResourceDefinition();
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

        const crd = await this.extensionsApi.createCustomResourceDefinition({
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
                        } as V1JSONSchemaProps
                    }
                }],
                scope: "Namespaced",
            }
        });

        console.log(crd.body);
    }
}
