import {
    BinaryOperation,
    BooleanLiteral,
    Cast,
    Expression,
    Identifier,
    IntType,
    NumberLiteral,
    UnaryOperation
} from "../ir";
import { Typing } from "../passes";
import { eq, fmt, PPIsh } from "../utils";
import { InterpError, InterpInternalError, poison, PrimitiveValue, State } from "./state";

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

export class ExprEvaluator {
    constructor(private readonly typing: Typing, private readonly state: State) {}

    private error(e: Expression, msg: string): never {
        throw new InterpError(e.src, msg, this.state);
    }

    private internalError(e: Expression, msg: string): never {
        throw new InterpInternalError(e.src, msg, this.state);
    }

    private assert(cond: boolean, e: Expression, msg: string, ...details: PPIsh[]): asserts cond {
        if (cond) {
            return;
        }

        this.internalError(e, fmt(msg, ...details));
    }

    private evalUnary(e: UnaryOperation): PrimitiveValue {
        const subValue = this.evalExpression(e.subExpr);

        if (e.op === "!") {
            this.assert(
                typeof subValue === "boolean",
                e,
                `Unary operation {0} expects boolean not {1}`,
                e,
                subValue
            );

            return !subValue;
        }

        if (e.op === "-") {
            this.assert(
                typeof subValue === "bigint",
                e,
                `Unary operation {0} expects bigint not {1}`,
                e,
                subValue
            );

            return this.clampIntToType(-subValue, e);
        }

        this.internalError(e, `NYI unary operation ${e.pp()}`);
    }

    private clampIntToType(val: bigint, e: Expression): bigint {
        const eT = this.typing.typeOf(e);

        this.assert(eT instanceof IntType, e, `Expected int type not {0} for {1}`, eT, e);

        return adjustIntToTypeSize(eT, val);
    }

    private evalBinary(e: BinaryOperation): PrimitiveValue {
        const lVal = this.evalExpression(e.leftExpr);

        // Implement logical short-circuiting
        if (e.op === "||" || e.op === "&&") {
            this.assert(
                typeof lVal === "boolean",
                e,
                `Binary operation {0} expects boolean not {1}`,
                e,
                lVal
            );

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
            this.assert(
                typeof lVal === "bigint" && typeof rVal === "bigint",
                e,
                `Binary operation {0} expects integers not {1} and {2}`,
                e,
                lVal,
                rVal
            );

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

        this.assert(
            typeof lVal === typeof rVal,
            e,
            `Binary operation {0} expects values of the same type not {1} and {2}`,
            e,
            lVal,
            rVal
        );

        /// Equalities can compare any two primitive values of the same type
        if (e.op === "==" || e.op === "!=") {
            const areEq = eq(lVal, rVal);

            return e.op === "==" ? areEq : !areEq;
        }

        /// Logical operations require booleans
        if (e.op === "&&" || e.op === "||") {
            this.assert(
                typeof lVal === "boolean",
                e,
                `Binary operation {0} expects booleans not not {1} and {2}`,
                e,
                lVal,
                rVal
            );

            return e.op === "&&" ? lVal && rVal : lVal || rVal;
        }

        /// All remaining binary operations require bigints
        this.assert(
            typeof lVal === "bigint" && typeof rVal === "bigint",
            e,
            `Binary operation {0} expects integers not not {1} and {2}`,
            e,
            lVal,
            rVal
        );

        if (e.op === "*") {
            return this.clampIntToType(lVal * rVal, e);
        }

        if (e.op === "/") {
            if (rVal === 0n) {
                this.error(e, `Division by 0.`);
            }

            return this.clampIntToType(lVal / rVal, e);
        }

        if (e.op === "%") {
            if (rVal === 0n) {
                this.error(e, `Division by 0.`);
            }

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

        this.internalError(e, `NYI binary op ${e.op}`);
    }

    private evalCast(e: Cast): PrimitiveValue {
        const subValue = this.evalExpression(e.subExpr);

        this.assert(typeof subValue === "bigint", e, `Unexpected value {0} in int cast`, subValue);

        return adjustIntToTypeSize(e.toType, subValue);
    }

    evalExpression(e: Expression): PrimitiveValue {
        if (e instanceof NumberLiteral) {
            return e.value;
        }

        if (e instanceof BooleanLiteral) {
            return e.value;
        }

        if (e instanceof Identifier) {
            let res = this.state.curMachFrame.store.get(e.name);

            if (res === undefined) {
                res = this.state.globals.get(e.name);
            }

            this.assert(
                res !== undefined,
                e,
                `Unexpected lookup of undefined identifier {0}`,
                e.name
            );

            if (res === poison) {
                this.error(e, `Reading an uninitialized value.`);
            }

            return res;
        }

        if (e instanceof UnaryOperation) {
            return this.evalUnary(e);
        }

        if (e instanceof BinaryOperation) {
            return this.evalBinary(e);
        }

        if (e instanceof Cast) {
            return this.evalCast(e);
        }

        this.internalError(e, `NYI expression ${e.pp()}`);
    }
}
