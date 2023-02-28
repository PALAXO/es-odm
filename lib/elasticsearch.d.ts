import { Client, NodeOptions } from "@elastic/elasticsearch/lib/client";
import { errors } from "@elastic/elasticsearch";

class Elasticsearch {
    client: Client;
    constructor(node: string | string[] | NodeOptions | NodeOptions[] = undefined);
    index(index, document, id, primary_term? = void 0, seq_no? = void 0, refresh? = true): Promise<any>;
    updateByQuery(index, body, scrollSize, waitForCompletion? = true, refresh? = true): Promise<any>;
    delete(index, id, primary_term? = void 0, seq_no? = void 0, refresh? = true): Promise<any>;
    deleteByQuery(index, body, scrollSize, waitForCompletion? = true, refresh? = true): Promise<any>;
    search(index, body, from, size, source? = void 0, trackTotalHits? = true, scroll? = false, searchAfter? = void 0, pointInTime? = void 0, refresh? = void 0): Promise<any>;
    scroll(scrollId, refresh? = this.SCROLL_TIMEOUT_SECONDS): Promise<any>;
    clearScroll(scrollId): Promise<any>;
    mget(index, ids, source? = true): Promise<any>;
    exists(index, id): Promise<any>;
    count(index, body? = void 0): Promise<any>;
    bulk(operations, refresh? = true): Promise<any>;
    createIndex(index, body? = void 0): Promise<any>;
    deleteIndex(index): Promise<any>;
    existsIndex(index): Promise<any>;
    getIndicesFromAlias(alias): Promise<any>;
    existsAlias(alias): Promise<any>;
    putAlias(index, alias): Promise<any>;
    deleteAlias(index, alias): Promise<any>;
    refresh(index): Promise<any>;
    getMapping(index): Promise<any>;
    putMapping(index, mapping): Promise<any>;
    getSettings(index, includeDefaults? = false): Promise<any>;
    putSettings(index, settings): Promise<any>;
    reindex(source, dest, script? = void 0, waitForCompletion? = true, refresh? = true): Promise<any>;
    clone(source, target, settings? = void 0): Promise<any>;
    openPIT(index, keepAlive? = this.PIT_TIMEOUT_SECONDS): Promise<any>;
    closePIT(id): Promise<any>;
}

export interface elasticsearchAdditional {
    scrollTimeoutSeconds?: number,
    pitTimeoutSeconds?: number,
    requestTimeoutSeconds?: number
}

function setClient(node: string | string[] | NodeOptions | NodeOptions[], additional: elasticsearchAdditional = void 0): void;

export {
    Elasticsearch as esClient,
    setClient,
    errors as esErrors
}
