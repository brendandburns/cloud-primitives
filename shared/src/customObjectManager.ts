import { ApiextensionsV1Api, KubeConfig, V1CustomResourceDefinition } from "@kubernetes/client-node";

export class CustomObjectManager {
    private readonly extensionsApi: ApiextensionsV1Api;

    constructor(kc: KubeConfig) {
        this.extensionsApi = kc.makeApiClient(ApiextensionsV1Api);
    }

    async createCustomApi(rsrc: V1CustomResourceDefinition) {
        const res = await this.extensionsApi.listCustomResourceDefinition();
        var found = false;
        res.body.items.forEach(element => {
            if (element.metadata!.name === rsrc.metadata!.name) {
                found = true;
            }
        });
        if (found) {
            return;
        }
        console.log(`Failed to find CRD for '${rsrc.metadata!.name}', creating.`);

        const crd = await this.extensionsApi.createCustomResourceDefinition(rsrc);

        console.log(crd.body);
    }
}
