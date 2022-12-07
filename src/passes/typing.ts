import {
    ArrayType,
    Assignment,
    BoolType,
    Branch,
    Definition,
    Expression,
    FunctionDefinition,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    StructDefinition,
    Type,
    UserDefinedType
} from "../ir";
import { eq } from "../utils";
import { Resolving } from "./resolving";

export class TypeError extends Error {}

/**
 * Simple pass to compute the type of each expression in each function in a
 * group of definitions. Also it checks that each statement types checks well.
 * Requires `Resolving`.
 */
export class Typing {
    /// @ts-ignore
    private typing: Map<Expression, Type>;

    constructor(public readonly defs: Definition[], private readonly resolve: Resolving) {
        this.typing = new Map();

        this.runAnalysis();
    }

    private runAnalysis(): void {
        for (const def of this.defs) {
            if (!(def instanceof FunctionDefinition) || def.body === undefined) {
                continue;
            }

            for (const bb of def.body.nodes.values()) {
                for (const stmt of bb.statements) {
                    this.tcStatement(stmt, def);
                }
            }
        }
    }

    private typeOfField(baseExpr: Expression, member: string): Type {
        const baseT = this.tcExpression(baseExpr);

        if (!(baseT instanceof PointerType && baseT.toType instanceof UserDefinedType)) {
            throw new TypeError();
            // `Load field statement expects a pointer to a struct as a base, not ${stmt.baseExpr.pp()} of type ${baseT.pp()}`
        }

        const def = this.resolve.getTypeDecl(baseT.toType);

        if (!(def instanceof StructDefinition)) {
            throw new TypeError(
                `Expected a pointer to a struct not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        const matchingFields = def.fields.filter(([name]) => name == member);

        if (matchingFields.length === 0) {
            throw new TypeError(
                `Struct ${baseT.toType.name} doesn't have field ${member} in load operation.`
            );
        }

        return matchingFields[0][1];
    }

    private typeOfIndex(baseExpr: Expression, indexExpr: Expression): Type {
        const baseT = this.tcExpression(baseExpr);
        const indexT = this.tcExpression(indexExpr);

        if (!(indexT instanceof IntType)) {
            throw new TypeError(
                `Indexing expect a numeric index, not ${indexExpr.pp()} of type ${indexT.pp()}`
            );
        }

        if (!(baseT instanceof PointerType && baseT.toType instanceof ArrayType)) {
            throw new TypeError(
                `Indexing expect a pointer to array as base, not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        return baseT.toType.baseType;
    }

    private tcStatement(stmt: Statement, fun: FunctionDefinition): void {
        if (stmt instanceof Assignment) {
            const lhsT = this.resolve.getIdDecl(stmt.lhs);
            if (lhsT === undefined) {
                throw new TypeError(`Unknown id ${stmt.lhs.name}`);
            }

            const rhsT = this.tcExpression(stmt.rhs);

            if (!eq(lhsT, rhsT)) {
                throw new TypeError(
                    `Cannot assign ${stmt.rhs.pp()} of type ${rhsT.pp()} to ${stmt.lhs.pp()} of type ${lhsT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Branch) {
            const condT = this.tcExpression(stmt.condition);

            if (!(condT instanceof BoolType)) {
                throw new TypeError(
                    `Branch statement expects boolean not ${stmt.condition.pp()} of type ${condT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Jump) {
            return;
        }

        if (stmt instanceof LoadField) {
            const lhs = this.resolve.getIdDecl(stmt.lhs);
            const baseT = this.tcExpression(stmt.baseExpr);

            if (!lhs) {
                throw new TypeError(`Unknown identifier ${stmt.lhs.name} in load operation.`);
            }

            const fieldT = this.typeOfField(stmt.baseExpr, stmt.member);

            if (!eq(lhs.type, fieldT)) {
                throw new TypeError(
                    `Cannot load field ${stmt.member} of struct ${
                        ((baseT as PointerType).toType as UserDefinedType).name
                    } of type ${fieldT.pp()} in ${lhs.name} of type ${lhs.type.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof LoadIndex) {
            const lhs = this.resolve.getIdDecl(stmt.lhs);

            if (!lhs) {
                throw new TypeError(`Unknown identifier ${stmt.lhs.name} in load operation.`);
            }

            const rhsT = this.typeOfIndex(stmt.baseExpr, stmt.indexExpr);

            if (!eq(lhs.type, rhsT)) {
                throw new TypeError(
                    `Cannot load index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()} in ${
                        lhs.name
                    } of type ${lhs.type.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Return) {
            const retTs = stmt.values.map((retExp) => this.tcExpression(retExp));
            const formalRetTs = fun.returns;

            if (retTs.length !== formalRetTs.length) {
                throw new TypeError(
                    `Function ${fun.name} expects ${
                        formalRetTs.length
                    } returns, but return ${stmt.pp()} returns ${retTs.length} values.`
                );
            }

            for (let i = 0; i < retTs.length; i++) {
                if (!eq(retTs[i], formalRetTs[i])) {
                    throw new TypeError(
                        `Mismatch in ${i}-th return of ${stmt.pp()} - expected ${formalRetTs[
                            i
                        ].pp()} instead got ${retTs[i].pp()}`
                    );
                }
            }

            return;
        }

        if (stmt instanceof StoreField) {
            const fieldT = this.typeOfField(stmt.baseExpr, stmt.member);
            const baseT = this.tcExpression(stmt.baseExpr);
            const rhsT = this.tcExpression(stmt.rhs);

            if (!eq(rhsT, fieldT)) {
                throw new TypeError(
                    `Cannot store ${stmt.rhs.pp()} of type ${rhsT.pp()} into field ${
                        stmt.member
                    } of struct ${
                        ((baseT as PointerType).toType as UserDefinedType).name
                    } of type ${fieldT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof StoreIndex) {
            const lhsT = this.typeOfIndex(stmt.baseExpr, stmt.indexExpr);
            const rhsT = this.tcExpression(stmt.rhs);

            if (!eq(rhsT, lhsT)) {
                throw new TypeError(
                    `Cannot store ${stmt.rhs.pp()} of type ${rhsT.pp()} into index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()}`
                );
            }

            return;
        }
    }

    private tcExpression(expr: Expression): Type {
        return undefined as unknown as Type;
    }
}
