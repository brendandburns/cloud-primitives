import { KubeConfig, V1CustomResourceDefinition, V1JSONSchemaProps } from "@kubernetes/client-node";
import { CustomObjectManager } from "../../shared/src/customObjectManager.js";

export class CachedManager extends CustomObjectManager {
    constructor(kc: KubeConfig) {
        super(kc);
    }

    async createCachedApi() {
        const crd: V1CustomResourceDefinition = {
            metadata: {
                name: "cached.metaparticle.io"
            },
            spec: {
                group: "metaparticle.io",
                names: {
                    kind: "cached",
                    plural: "cached"
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
                                        service: {
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
        };
        await super.createCustomApi(crd);
    }
}
