import { V1ObjectMeta} from '@kubernetes/client-node';

export interface SingletonSpec {
    image: string;
}

export interface Singleton {
    metadata: V1ObjectMeta;
    spec: SingletonSpec;
}

export interface SingletonList {
    items: Singleton[];
}