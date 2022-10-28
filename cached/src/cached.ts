import { V1ObjectMeta} from '@kubernetes/client-node';

export interface CachedSpec {
    service: string;
}

export interface Cached {
    metadata: V1ObjectMeta;
    spec: CachedSpec;
}

export interface CachedList {
    items: Cached[];
}