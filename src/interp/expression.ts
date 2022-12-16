import {
    BaseSrc,
    BinaryOperation,
    BooleanLiteral,
    Expression,
    Identifier,
    IntType,
    NumberLiteral,
    UnaryOperation
} from "../ir";
import { Typing } from "../passes";
import { eq } from "../utils";
import { PrimitiveValue, State } from "./state";

export class InterpError extends Error {
    constructor(public readonly src: BaseSrc, msg: string, state: State) {
        super(`${src.pp()}: ${msg}\n${state.stackTrace()}`);
    }
}

const two = BigInt(2);

function getTypeRange(bits: number, signed: boolean): [bigint, bigint, bigint] {
    const total = two ** BigInt(bits);
    const half = two ** BigInt(bits - 1);

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

export class ExprEvaluator {
    constructor(private readonly typing: Typing, private readonly state: State) {}

    private error(e: Expression, msg: string): never {
        throw new InterpError(e.src, msg, this.state);
    }

    private evalUnary(e: UnaryOperation): PrimitiveValue {
        const subValue = this.evalExpression(e.subExpr);

        if (e.op === "!") {
            if (!(typeof subValue === "boolean")) {
                this.error(e, `Unary operation ${e.pp()} expects boolean not ${subValue}`);
            }

            return !subValue;
        }

        if (e.op === "-") {
            if (!(typeof subValue === "bigint")) {
                this.error(e, `Unary operation ${e.pp()} expects bigint not ${subValue}`);
            }

            return -subValue;
        }

        this.error(e, `NYI unary operation ${e.pp()}`);
    }

    private clampIntToType(val: bigint, e: Expression): bigint {
        const eT = this.typing.typeOf(e);

        if (eT === undefined) {
            this.error(e, `Missing type for ${e.pp()}`);
        }

        if (!(eT instanceof IntType)) {
            this.error(e, `Expected int type not ${eT.pp()} for ${e.pp()}`);
        }

        return adjustIntToTypeSize(eT, val);
    }

    private evalBinary(e: BinaryOperation): PrimitiveValue {
        const lVal = this.evalExpression(e.leftExpr);

        // Implement logical short-circuiting
        if (e.op === "||" || e.op === "&&") {
            if (!(typeof lVal === "boolean")) {
                this.error(e, `Binary operation ${e.pp()} expects boolean not ${lVal}`);
            }

            if (e.op == "||" && lVal) {
                return true;
            }

            if (e.op == "&&" && !lVal) {
                return false;
            }
        }

        const rVal = this.evalExpression(e.rightExpr);

        // Handle the 3 binary operations that have potentially differing types
        if (e.op === "**" || e.op === "<<" || e.op === ">>") {
            if (!(typeof lVal === "bigint" && typeof rVal === "bigint")) {
                this.error(
                    e,
                    `Binary operation ${e.pp()} expects integers not ${lVal} and ${rVal}`
                );
            }

            let res: bigint;

            if (e.op === "**") {
                res = lVal ** rVal;
            } else if (e.op === "<<") {
                res = lVal << rVal;
            } else {
                res = lVal >> rVal;
            }

            return this.clampIntToType(res, e);
        }

        if (typeof lVal !== typeof rVal) {
            this.error(
                e,
                `Binary operation ${e.pp()} expects values of the same type not ${lVal} and ${rVal}`
            );
        }

        /// Equalities can compare any two primitive values of the same type
        if (e.op === "==" || e.op === "!=") {
            const areEq = eq(lVal, rVal);

            return e.op === "==" ? areEq : !areEq;
        }

        /// Logical operations require booleans
        if (e.op === "&&" || e.op === "||") {
            if (typeof lVal !== "boolean") {
                this.error(
                    e,
                    `Binary operation ${e.pp()} expects booleans not not ${lVal} and ${rVal}`
                );
            }

            return e.op === "&&" ? lVal && rVal : lVal || rVal;
        }

        /// All remaining binary operations require bigints
        if (typeof lVal !== "bigint" || typeof rVal !== "bigint") {
            this.error(
                e,
                `Binary operation ${e.pp()} expects integers not not ${lVal} and ${rVal}`
            );
        }

        if (e.op === "*") {
            return this.clampIntToType(lVal * rVal, e);
        }

        if (e.op === "/") {
            return this.clampIntToType(lVal / rVal, e);
        }

        if (e.op === "%") {
            return this.clampIntToType(lVal % rVal, e);
        }

        if (e.op === "&") {
            return this.clampIntToType(lVal & rVal, e);
        }

        if (e.op === "|") {
            return this.clampIntToType(lVal | rVal, e);
        }

        if (e.op === "^") {
            return this.clampIntToType(lVal ^ rVal, e);
        }

        if (e.op === "+") {
            return this.clampIntToType(lVal + rVal, e);
        }

        if (e.op === "-") {
            return this.clampIntToType(lVal - rVal, e);
        }

        if (e.op === "<") {
            return lVal < rVal;
        }

        if (e.op === "<=") {
            return lVal <= rVal;
        }

        if (e.op === ">") {
            return lVal > rVal;
        }

        if (e.op === ">=") {
            return lVal >= rVal;
        }

        throw new Error(`NYI binary op ${e.op}`);
    }

    evalExpression(e: Expression): PrimitiveValue {
        if (e instanceof NumberLiteral) {
            return e.value;
        }

        if (e instanceof BooleanLiteral) {
            return e.value;
        }

        if (e instanceof Identifier) {
            const res = this.state.curFrame.store.get(e.name);

            if (res === undefined) {
                this.error(e, `Unexpected lookup of undefined identifier ${e.name}`);
            }

            return res;
        }

        if (e instanceof UnaryOperation) {
            return this.evalUnary(e);
        }

        if (e instanceof BinaryOperation) {
            return this.evalBinary(e);
        }

        throw new Error(`NYI expression ${e.pp()}`);
    }
}
