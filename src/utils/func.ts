export function getOrErr<K, V>(m: Map<K, V>, key: K, err: string): V {
    const res = m.get(key);

    if (res === undefined) {
        throw new Error(err);
    }

    return res;
}
