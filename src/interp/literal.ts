import {
    ArrayLiteral,
    ArrayType,
    BooleanLiteral,
    BoolType,
    GlobalVarLiteral,
    IntType,
    MemConstant,
    NumberLiteral,
    PointerType,
    StructDefinition,
    StructLiteral,
    Type,
    UserDefinedType
} from "../ir";
import { concretizeType, makeSubst, Resolving } from "../passes";
import { PPIsh, fmt } from "../utils";
import { State, InterpInternalError, PrimitiveValue } from "./state";

export class LiteralEvaluator {
    constructor(private readonly resolving: Resolving, private readonly state: State) {}

    private internalError(e: GlobalVarLiteral, msg: string): never {
        throw new InterpInternalError(e.src, msg, this.state);
    }

    private assert(
        cond: boolean,
        e: GlobalVarLiteral,
        msg: string,
        ...details: PPIsh[]
    ): asserts cond {
        if (cond) {
            return;
        }

        this.internalError(e, fmt(msg, ...details));
    }

    /**
     * Evaluate a literal in the current state. Note that if the literal is an array or struct,
     * this will define that array/struct in the corresponding memory.
     *
     * We assume that the literals have been type checked at this point
     */
    evalLiteral(lit: GlobalVarLiteral, expectedT: Type): PrimitiveValue {
        if (expectedT instanceof BoolType && lit instanceof BooleanLiteral) {
            return lit.value;
        }

        if (expectedT instanceof IntType && lit instanceof NumberLiteral) {
            return lit.value;
        }

        if (expectedT instanceof PointerType) {
            const toT = expectedT.toType;

            this.assert(expectedT.region instanceof MemConstant, lit, ``);

            if (toT instanceof ArrayType && lit instanceof ArrayLiteral) {
                const arrayVal = lit.values.map((v) => this.evalLiteral(v, toT.baseType));
                return this.state.define(arrayVal, expectedT.region.name);
            }

            if (toT instanceof UserDefinedType && lit instanceof StructLiteral) {
                const def = this.resolving.getTypeDecl(toT);
                const structVal = new Map<string, PrimitiveValue>();

                this.assert(def instanceof StructDefinition, lit, ``);
                const litMap = new Map(lit.fields);
                const subst = makeSubst(toT, this.resolving.global);

                for (const [name, fieldT] of def.fields) {
                    const fieldLit = litMap.get(name) as GlobalVarLiteral;

                    structVal.set(
                        name,
                        this.evalLiteral(
                            fieldLit,
                            concretizeType(fieldT, subst, this.resolving.getScope(def))
                        )
                    );
                }

                return this.state.define(structVal, expectedT.region.name);
            }
        }

        this.internalError(lit, `Unexpected literal/type combo: ${lit.pp()} and ${expectedT.pp()}`);
    }
}
