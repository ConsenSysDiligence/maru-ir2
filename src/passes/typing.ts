import {
    ArrayType,
    Assignment,
    BinaryOperation,
    BooleanLiteral,
    BoolType,
    Branch,
    Definition,
    Expression,
    FunctionDefinition,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    noSrc,
    NumberLiteral,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    StructDefinition,
    Type,
    UnaryOperation,
    UserDefinedType
} from "../ir";
import { eq, MIRTypeError } from "../utils";
import { Resolving } from "./resolving";

export const boolT = new BoolType(noSrc);

/**
 * Simple pass to compute the type of each expression in each function in a
 * group of definitions. Also it checks that each statement types checks well.
 * Requires `Resolving`.
 */
export class Typing {
    typeCache: Map<Expression, Type>;

    constructor(public readonly defs: Definition[], private readonly resolve: Resolving) {
        this.typeCache = new Map();
        this.runAnalysis();
    }

    public typeOf(e: Expression): Type | undefined {
        return this.typeCache.get(e);
    }

    private runAnalysis(): void {
        for (const def of this.defs) {
            if (!(def instanceof FunctionDefinition && def.body !== undefined)) {
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
            throw new MIRTypeError(
                baseExpr.src,
                `Expected a pointer to a struct not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        const def = this.resolve.getTypeDecl(baseT.toType);

        if (!(def instanceof StructDefinition)) {
            throw new MIRTypeError(
                baseExpr.src,
                `Expected a pointer to a struct not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        const matchingFields = def.fields.filter(([name]) => name == member);

        if (matchingFields.length === 0) {
            throw new MIRTypeError(
                baseExpr.src,
                `Struct ${baseT.toType.name} doesn't have field ${member} in load operation.`
            );
        }

        return matchingFields[0][1];
    }

    private typeOfIndex(baseExpr: Expression, indexExpr: Expression): Type {
        const baseT = this.tcExpression(baseExpr);
        const indexT = this.tcExpression(indexExpr);

        if (!(indexT instanceof IntType)) {
            throw new MIRTypeError(
                indexExpr.src,
                `Indexing expect a numeric index, not ${indexExpr.pp()} of type ${indexT.pp()}`
            );
        }

        if (!(baseT instanceof PointerType && baseT.toType instanceof ArrayType)) {
            throw new MIRTypeError(
                baseExpr.src,
                `Indexing expect a pointer to array as base, not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        return baseT.toType.baseType;
    }

    private tcStatement(stmt: Statement, fun: FunctionDefinition): void {
        if (stmt instanceof Assignment) {
            const lhsT = this.tcExpression(stmt.lhs);
            const rhsT = this.tcExpression(stmt.rhs);

            if (!eq(lhsT, rhsT)) {
                throw new MIRTypeError(
                    stmt.src,
                    `Cannot assign ${stmt.rhs.pp()} of type ${rhsT.pp()} to ${stmt.lhs.pp()} of type ${lhsT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Branch) {
            const condT = this.tcExpression(stmt.condition);

            if (!(condT instanceof BoolType)) {
                throw new MIRTypeError(
                    stmt.condition.src,
                    `Branch statement expects boolean not ${stmt.condition.pp()} of type ${condT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Jump) {
            return;
        }

        if (stmt instanceof LoadField) {
            const lhsT = this.tcExpression(stmt.lhs);
            const baseT = this.tcExpression(stmt.baseExpr);
            const fieldT = this.typeOfField(stmt.baseExpr, stmt.member);

            if (!eq(lhsT, fieldT)) {
                throw new MIRTypeError(
                    stmt.src,
                    `Cannot load field ${stmt.member} of struct ${
                        ((baseT as PointerType).toType as UserDefinedType).name
                    } of type ${fieldT.pp()} in ${stmt.lhs.name} of type ${lhsT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof LoadIndex) {
            const lhsT = this.tcExpression(stmt.lhs);
            const rhsT = this.typeOfIndex(stmt.baseExpr, stmt.indexExpr);

            if (!eq(lhsT, rhsT)) {
                throw new MIRTypeError(
                    stmt.src,
                    `Cannot load index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()} in ${
                        stmt.lhs.name
                    } of type ${lhsT.pp()}`
                );
            }

            return;
        }

        if (stmt instanceof Return) {
            const retTs = stmt.values.map((retExp) => this.tcExpression(retExp));
            const formalRetTs = fun.returns;

            if (retTs.length !== formalRetTs.length) {
                throw new MIRTypeError(
                    stmt.src,
                    `Function ${fun.name} expects ${
                        formalRetTs.length
                    } returns, but return ${stmt.pp()} returns ${retTs.length} values.`
                );
            }

            for (let i = 0; i < retTs.length; i++) {
                if (!eq(retTs[i], formalRetTs[i])) {
                    throw new MIRTypeError(
                        stmt.src,
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
                throw new MIRTypeError(
                    stmt.src,
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
                throw new MIRTypeError(
                    stmt.src,
                    `Cannot store ${stmt.rhs.pp()} of type ${rhsT.pp()} into index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()}`
                );
            }

            return;
        }
    }

    private tcExpression(expr: Expression): Type {
        let res = this.typeCache.get(expr);

        if (res) {
            return res;
        }

        res = this.tcExpressionImpl(expr);

        this.typeCache.set(expr, res);
        return res;
    }

    private tcExpressionImpl(expr: Expression): Type {
        if (expr instanceof BooleanLiteral) {
            return boolT;
        }

        if (expr instanceof NumberLiteral) {
            return expr.type;
        }

        if (expr instanceof Identifier) {
            const decl = this.resolve.getIdDecl(expr);

            if (decl === undefined) {
                throw new MIRTypeError(expr.src, `Unknown identifier ${expr.name}`);
            }

            return decl.type;
        }

        if (expr instanceof UnaryOperation) {
            const innerT = this.tcExpression(expr.subExpr);

            if (expr.op === "-") {
                if (!(innerT instanceof IntType)) {
                    throw new MIRTypeError(
                        expr.src,
                        `Unary - expects an int type, not ${expr.subExpr.pp()} of type ${innerT.pp()}`
                    );
                }

                return innerT;
            }

            if (expr.op === "!") {
                if (!(innerT instanceof BoolType)) {
                    throw new MIRTypeError(
                        expr.src,
                        `Unary ! expects a bool type, not ${expr.subExpr.pp()} of type ${innerT.pp()}`
                    );
                }

                return innerT;
            }

            throw new Error(`Unknown unary operator ${expr.op}`);
        }

        if (expr instanceof BinaryOperation) {
            const lhsT = this.tcExpression(expr.leftExpr);
            const rhsT = this.tcExpression(expr.rightExpr);

            /// Power and bitshifts are the only binary operators
            /// where we don't insist that the left and right sub-expressions
            /// are of the same type.
            if (["**", ">>", "<<"].includes(expr.op)) {
                if (!(lhsT instanceof IntType && rhsT instanceof IntType)) {
                    throw new MIRTypeError(
                        expr,
                        `Binary operator ${
                            expr.op
                        } expects integer arguments, not ${expr.leftExpr.pp()} of type ${lhsT.pp()} and ${expr.rightExpr.pp()} of type ${rhsT.pp()}`
                    );
                }

                return lhsT;
            }

            if (!eq(lhsT, rhsT)) {
                throw new MIRTypeError(
                    expr,
                    `Binary operator ${
                        expr.op
                    } expects arguments of the same type, not ${expr.leftExpr.pp()} of type ${lhsT.pp()} and ${expr.rightExpr.pp()} of type ${rhsT.pp()}`
                );
            }

            if (["==", "!="].includes(expr.op)) {
                if (
                    !(
                        lhsT instanceof IntType ||
                        lhsT instanceof BoolType ||
                        lhsT instanceof PointerType
                    )
                ) {
                    throw new MIRTypeError(
                        expr,
                        `Cannot perform equality check between ${lhsT.pp()} types.`
                    );
                }
                return boolT;
            }

            if (["<", ">", "<=", ">="].includes(expr.op)) {
                if (!(lhsT instanceof IntType && rhsT instanceof IntType)) {
                    throw new MIRTypeError(
                        expr,
                        `Binary operator ${
                            expr.op
                        } expects integer arguments, not ${expr.leftExpr.pp()} of type ${lhsT.pp()} and ${expr.rightExpr.pp()} of type ${rhsT.pp()}`
                    );
                }

                return boolT;
            }

            if (["*", "/", "%", "+", "-", "&", "|", "^"].includes(expr.op)) {
                if (!(lhsT instanceof IntType && rhsT instanceof IntType)) {
                    throw new MIRTypeError(
                        expr,
                        `Binary operator ${
                            expr.op
                        } expects integer arguments, not ${expr.leftExpr.pp()} of type ${lhsT.pp()} and ${expr.rightExpr.pp()} of type ${rhsT.pp()}`
                    );
                }

                return lhsT;
            }

            if (["&&", "||"].includes(expr.op)) {
                if (!(lhsT instanceof BoolType && rhsT instanceof BoolType)) {
                    throw new MIRTypeError(
                        expr,
                        `Binary operator ${
                            expr.op
                        } expects boolean arguments, not ${expr.leftExpr.pp()} of type ${lhsT.pp()} and ${expr.rightExpr.pp()} of type ${rhsT.pp()}`
                    );
                }

                return lhsT;
            }

            throw new Error(`Unknown binary operator ${expr.op}`);
        }

        throw new Error(`Unknown expression ${expr.pp()}`);
    }
}
