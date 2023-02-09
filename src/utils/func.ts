export function getOrErr<K, V>(m: Map<K, V>, key: K, err: string): V {
    const res = m.get(key);

    if (res === undefined) {
        throw new Error(err);
    }

    return res;
}

export function zip<T1, T2>(a1: T1[], a2: T2[]): Array<[T1, T2]> {
    if (a1.length !== a2.length) {
        throw new Error(
            `Unexpected arrays of different lengths ${a1.length} and ${a2.length} in zip`
        );
    }

    const res: Array<[T1, T2]> = [];

    for (let i = 0; i < a1.length; i++) {
        res.push([a1[i], a2[i]]);
    }

    return res;
}

export function fill<T>(size: number, value: T): T[] {
    if (size < 0) {
        throw new Error(`Expected positive array size valie, got ${size}`);
    }

    const res: T[] = [];

    for (let i = 0; i < size; i++) {
        res.push(value);
    }

    return res;
}
