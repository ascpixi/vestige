import * as flow from "@xyflow/react";
import * as cbor from "cbor2";
import * as base64 from "byte-base64";

import { VestigeNode } from "./nodes";
import { assert, uniqueId } from "./util";

/**
 * Represents an object that can create serialization-friendly data-only wrappers
 * around objects of type `TIn`.
 */
export interface NodeDataSerializer<TIn> {
    /** The type of the nodes that this object can serialize/deserialize the data of. */
    type: string;

    /** Serializes the data of a node. */
    serialize(obj: TIn): unknown;

    /** Deserializes the data of a node. */
    deserialize(serialized: ReturnType<this["serialize"]>): TIn | Promise<TIn>;
}

/**
 * Represents a `NodeDataSerializer` that serializes nodes which do not have any
 * special data associated with them.
 */
export abstract class NullNodeDataSerializer<TIn> implements NodeDataSerializer<TIn> {
    abstract type: string;

    serialize(_: TIn) { return {}; }
    deserialize(_: ReturnType<this["serialize"]>) { return this.make(); }

    abstract make(): TIn;
}

interface SerializedNode {
    /** The unique ID of the node. */
    i: string;

    /** The type identifier for the node. */
    t: string;

    /** The X coordinate of the node. */
    x: number;

    /** The Y coordinate of the node. */
    y: number;

    /**
     * The serialized data of the node, meant to be deserialized with the
     * `Serializer<TIn, TOut>` associated with `t`.
     */
    d: unknown;
}

interface SerializedEdge {
    /** The node the connection is coming from. */
    s: string;

    /** The source handle ID. */
    sh: string | null | undefined;

    /** The node the connection is targeting. */
    t: string;

    /** The destination handle ID. */
    th: string | null | undefined;
}

interface SerializedProject {
    /**
     * The version of the serialization protocol used to encode this project.
     * This only changes when the actual protocol changes - for changes in the
     * data structure of nodes, this field should *not* change.
     * 
     * A version of `0` is considered invalid.
     */
    version: number;

    /**
     * The nodes present in the project. The final node should always be the
     * first element in this array.
     */
    nodes: SerializedNode[];

    /** The edges present in the project. */
    edges: SerializedEdge[];
}

function serializeNode(
    node: VestigeNode,
    serializers: NodeDataSerializer<any>[]
): SerializedNode {
    assert(node.type, `The node ${node.id} is missing its type`);

    const serializer = serializers.find(x => x.type == node.type);
    assert(serializer, `No serializer for node type ${node.type}`);

    return {
        t: node.type,
        x: node.position.x,
        y: node.position.y,
        i: node.id,
        d: serializer.serialize(node.data)
    };
}

async function deserializeNode(
    node: SerializedNode,
    serializers: NodeDataSerializer<any>[]
): Promise<VestigeNode> {
    const deserializer = serializers.find(x => x.type == node.t);
    assert(deserializer, `No (de)serializer for node type ${node.t}`);

    return {
        id: node.i,
        type: node.t as any,
        position: { x: node.x, y: node.y },
        data: await deserializer.deserialize(node.d)
    }
}

function serializeEdge(edge: flow.Edge): SerializedEdge {
    return {
        t: edge.target,
        th: edge.targetHandle,
        s: edge.source,
        sh: edge.sourceHandle
    };
}

function deserializeEdge(edge: SerializedEdge): flow.Edge {
    return {
        id: `id-${edge.t}-${edge.th}-${edge.s}-${edge.sh}-${uniqueId()}`,
        target: edge.t,
        targetHandle: edge.th,
        source: edge.s,
        sourceHandle: edge.sh,
        type: "vestige"
    };
}

/**
 * Serializes a Vestige project into raw bytes.
 */
export async function serialize(
    nodes: VestigeNode[],
    edges: flow.Edge[],
    serializers: NodeDataSerializer<any>[]
): Promise<Uint8Array> {
    const srlNodes: SerializedNode[] = [
        // The "final" node is required to be first.
        serializeNode(nodes.find(x => x.type == "final")!, serializers),

        // We serialize all other nodes normally.
        ...nodes.filter(x => x.type != "final")
            .map(x => serializeNode(x, serializers))
    ];

    const srlEdges: SerializedEdge[] = edges.map(x => serializeEdge(x));

    const data = cbor.encode({
        version: 1,
        nodes: srlNodes,
        edges: srlEdges
    } satisfies SerializedProject);

    const compressed = await compress(data);

    let result: Uint8Array;
    if (compressed.length < data.length) {
        console.debug(`Using compressed format - saved bytes: ${data.length - compressed.length}`)
        result = prefixData(0x01, compressed);
    } else {
        console.debug(`Using raw format - overhead: ${compressed.length - data.length}`)
        result = prefixData(0x00, data);
    }

    return result;
}

/**
 * Serializes a Vestige project into a Base-64 encoded string.
 */
export async function serializeBase64(
    nodes: VestigeNode[],
    edges: flow.Edge[],
    serializers: NodeDataSerializer<any>[]
): Promise<string> {
    return base64.bytesToBase64(await serialize(nodes, edges, serializers))
        .replace(/\//g, "_")
        .replace(/\+/g, "-");
}

/**
 * Deserializes a Vestige project.
 */
export async function deserialize(data: Uint8Array, serializers: NodeDataSerializer<any>[]): Promise<{
    nodes: VestigeNode[],
    edges: flow.Edge[]
}> {
    let bytes: Uint8Array;
    if (data[0] == 0x00) {
        bytes = data.subarray(1); // Uncompressed
    } else if (data[0] == 0x01) {
        bytes = await decompress(data.subarray(1)); // Compressed
    } else {
        throw new Error(`Unknown data prefix ${data[0]}`);
    }

    const project = cbor.decode(bytes) as SerializedProject;
    if (!project.version) {
        console.error("The project schema is invalid (no version field)!", project);
        throw new Error("Invalid project schema");
    }

    console.debug("Project deserialized from CBOR.", project);

    // When we'll need to add changes to the serialization protocol, this will
    // need to be changed.
    if (project.version != 1)
        throw new Error(`Unsupported project schema version ${project.version}`);

    return {
        nodes: await Promise.all(project.nodes.map(x => deserializeNode(x, serializers))),
        edges: project.edges.map(x => deserializeEdge(x))
    };
}

/**
 * Deserializes a Vestige project from its base-64 encoded form.
 */
export async function deserializeBase64(data: string, serializers: NodeDataSerializer<any>[]): Promise<{
    nodes: VestigeNode[],
    edges: flow.Edge[]
}> {
    return await deserialize(
        base64.base64ToBytes(
            data.replace(/_/g, "/").replace(/-/g, "+")
        ),
        serializers
    );
}

function prefixData(prefix: number, data: Uint8Array) {
    const prefixed = new Uint8Array(data.length + 1);
    prefixed[0] = prefix;
    prefixed.set(data, 1);
    return prefixed;
}

const COMPRESS_ALGO: CompressionFormat = "deflate-raw";

// Attribution: https://dev.to/lucasdamianjohnson/compress-decompress-an-arraybuffer-client-side-in-js-2nf6

async function compress(input: ArrayBuffer) {
    const cs = new CompressionStream(COMPRESS_ALGO);
    const writer = cs.writable.getWriter();

    writer.write(input);
    writer.close();

    const output: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    let totalSize = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        output.push(value);
        totalSize += value.byteLength;
    }

    const concatenated = new Uint8Array(totalSize);
    let offset = 0;

    for (const array of output) {
        concatenated.set(array, offset);
        offset += array.byteLength;
    }

    return concatenated;
};

async function decompress(input: ArrayBuffer): Promise<Uint8Array> {
    const ds = new DecompressionStream(COMPRESS_ALGO);
    const writer = ds.writable.getWriter();

    writer.write(input);
    writer.close();

    const output: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    let totalSize = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        output.push(value);
        totalSize += value.byteLength;
    }

    const concatenated = new Uint8Array(totalSize);
    let offset = 0;

    for (const array of output) {
        concatenated.set(array, offset);
        offset += array.byteLength;
    }

    return concatenated;
}

interface Property<TSelf, T> {
    get(self: TSelf): T;
    set(self: TSelf, x: T): void;
    migrationDefault?: T;
}

/**
 * Represents the serialized key name to getter-setter mapping that a FlatNodeDataSerializer
 * should follow.
 */
export type FlatSerializerSpec<TIn> = { [key: string]: Property<TIn, any> };

type OmitIndexSignature<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/**
 * Implements a `NodeDataSerializer<TIn>` that follows a specification (`spec`), serializing
 * data to a flat object (with no explicitly given nested children).
 */
export abstract class FlatNodeDataSerializer<TIn> implements NodeDataSerializer<TIn> {
    abstract type: string;
    abstract dataFactory: () => TIn;
    abstract spec: FlatSerializerSpec<TIn>;

    protected beforeSerialize?(data: TIn): void;
    protected afterSerialize?(serialized: Record<string, any>): void;

    protected beforeDeserialize?(): void;
    protected afterDeserialize?(data: TIn): void;

    serialize(obj: TIn) {
        this.beforeSerialize?.(obj);

        const serialized: Record<string, any> = {};

        for (const [key, prop] of Object.entries(this.spec)) {
            serialized[key] = prop.get(obj);
        }

        this.afterSerialize?.(serialized);
        return serialized;
    }

    deserialize(serialized: ReturnType<this["serialize"]>): TIn | Promise<TIn> {
        this.beforeDeserialize?.();
        const data = this.dataFactory();

        for (const [key, prop] of Object.entries(this.spec)) {
            let value: any;

            if (!(key in serialized)) {
                value = prop.migrationDefault;
            } else {
                value = serialized[key];
            }

            prop.set(data, value);
        }

        this.afterDeserialize?.(data);
        return data;
    }

    /**
     * Creates a `Property<TIn, TIn[K]>` that represents member `K` of the node data type.
     * @param key The target key.
     * @param migrationDefault If the serialized form stores the member as `undefined`, this value will be used instead.
     */
    prop<K extends keyof OmitIndexSignature<TIn>>(
        key: K,
        migrationDefault?: TIn[K]
    ): Property<TIn, TIn[K]>;

    /**
     * Begins the creation of a `Property<TIn, T[K]>`, which represents any member of
     * any child of the node data type. This method returns an object with a `with` method,
     * which should be called to provide the actual key.
     */
    prop<T>(
        parentGetter: (self: TIn) => T
    ): {

        /**
         * Specifies the key `K` that the resulting `Property<TIn, T[K]>` should hold.
         * This ultimately creates the `Property<TIn, T[K]>` object.
         * @param key The target key, on the child specified by the `prop` call the object with this method was obtained from.
         * @param migrationDefault If the serialized form stores the member as `undefined`, this value will be used instead.
         */
        // We do this, as TypeScript doesn't seem to be able to infer both of the
        // types at once. We have to first let it infer the type from the lambda,
        // and then infer K from the `with` call.
        with<K extends keyof T>(
            key: K,
            migrationDefault?: T[K]
        ): Property<TIn, T[K]>
    };
    
    prop<T>(
        parentGetterOrSelfKey: ((self: TIn) => T) | keyof TIn,
        migrationDefault?: TIn[keyof TIn]
    ) {
        if (typeof parentGetterOrSelfKey !== "function") {
            // overload: prop(key: keyof TIn): Property<TIn, TIn[typeof key]>; 
            const selfKey = parentGetterOrSelfKey;

            return {
                get: (self: TIn) => self[selfKey],
                set: (self: TIn, value: TIn[typeof selfKey]) => self[selfKey] = value,
                migrationDefault
            } as any;
        }
        
        // overload: prop<T>(parentGetter: (self: TIn) => T, key: keyof T): Property<TIn, T[typeof key]>;
        assert(typeof parentGetterOrSelfKey == "function");
        const parentGetter = parentGetterOrSelfKey;
        
        return {
            with<K extends keyof T>(
                key: K,
                migrationDefault?: T[K]
            ): Property<TIn, T[K]> {
                return {
                    get: (self: TIn) => parentGetter(self)[key],
                    set: (self: TIn, value: T[typeof key]) => parentGetter(self)[key] = value,
                    migrationDefault
                };
            }
        }
    }
}
