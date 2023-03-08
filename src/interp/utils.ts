import { IntType } from "../ir";
import { pp } from "../utils";
import { PrimitiveValue, State } from "./state";

export function getTypeRange(bits: number, signed: boolean): [bigint, bigint, bigint] {
    const total = 2n ** BigInt(bits);
    const half = 2n ** BigInt(bits - 1);

    if (signed) {
        const signedLow = -half;
        const signedHigh = half - 1n;

        return [signedLow, signedHigh, total];
    }

    const unsignedLow = 0n;
    const unsignedHigh = total - 1n;

    return [unsignedLow, unsignedHigh, total];
}

export function fits(val: bigint, type: IntType): boolean {
    const [low, high] = getTypeRange(type.nbits, type.signed);

    return low <= val && val <= high;
}

/**
 * Returns big integer that is the result of overflow/underflow handling
 * of input `value` in range of specified `type`.
 */
export function adjustIntToTypeSize(type: IntType, value: bigint): bigint {
    const bits = type.nbits;

    /**
     * Skip truncation for number literal type, as it do not have corresponding value range.
     */
    if (bits === undefined) {
        return value;
    }

    const [low, high, total] = getTypeRange(bits, type.signed);

    /**
     * Skip if value fits to a type range
     */
    if (value >= low && value <= high) {
        return value;
    }

    let result = value % total;

    if (type.signed) {
        if (result < low) {
            const remainder = result % low;

            result = high + remainder + 1n;
        } else if (result > high) {
            const remainder = result % high;
            const quotient = result / high;

            result = quotient >= 1 ? result - total : low + (remainder - 1n);
        }
    } else if (result < low) {
        result = total + result;
    }

    return result;
}

/**
 * Helper to extract an interpreter value into a normal JS value.
 * Supports maps and arrays.
 */
export function toJsVal(v: PrimitiveValue, s: State): any {
    if (v instanceof Array) {
        const complexVal = s.deref(v);

        if (complexVal instanceof Array) {
            return complexVal.map((val) => toJsVal(val, s));
        }

        const res: any = {};

        for (const [field, val] of complexVal) {
            res[field] = toJsVal(val, s);
        }

        return res;
    }

    return v;
}

/**
 * Helper to convert a normal JS value into an interpreter value.
 * If the JS value is complex, then it is encoded in the provided `memory`.
 */
export function fromJsVal(v: any, memory: string, s: State): PrimitiveValue {
    if (typeof v === "number") {
        return BigInt(v);
    }

    if (typeof v === "bigint" || typeof v === "boolean") {
        return v;
    }

    if (v instanceof Array) {
        const arr = v.map((el) => fromJsVal(el, memory, s));

        return s.define(arr, memory);
    }

    if (v instanceof Object) {
        const struct = new Map();

        for (const field in v) {
            struct.set(field, fromJsVal(v[field], memory, s));
        }

        return s.define(struct, memory);
    }

    throw new Error(`Cannot encode ${pp(v)} into interpreter`);
}
