import {
    ArrayType,
    Assignment,
    BinaryOperation,
    BooleanLiteral,
    BoolType,
    Branch,
    Definition,
    Expression,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    MemConstant,
    MemDesc,
    MemVariableDeclaration,
    noSrc,
    NumberLiteral,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    StructDefinition,
    Abort,
    TransactionCall,
    Type,
    UnaryOperation,
    UserDefinedType,
    TypeVariableDeclaration,
    AllocArray,
    AllocStruct,
    Assert,
    FreshMemVariableDeclaration
} from "../ir";
import { eq, MIRTypeError, pp, zip } from "../utils";
import { Resolving } from "./resolving";

export const boolT = new BoolType(noSrc);
type MemSubstitution = Map<MemVariableDeclaration, MemConstant | MemVariableDeclaration>;
type TypeSubstitution = Map<TypeVariableDeclaration, Type>;
type Substitution = [MemSubstitution, TypeSubstitution];

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

    /**
     * Helper to compute the type of `<baseExpr>.field`. It:
     * 1. Gets the type of <baseExpr> - baseT
     * 2. Makes sure baseT is a defined struct
     * 3. Looks up the type of the field
     * 4. Substitutes any memory vars for their concrete values
     */
    private typeOfField(baseExpr: Expression, member: string): Type {
        const baseT = this.typeOfExpression(baseExpr);

        if (!(baseT instanceof PointerType && baseT.toType instanceof UserDefinedType)) {
            throw new MIRTypeError(
                baseExpr.src,
                `Expected a pointer to a struct not ${baseExpr.pp()} of type ${baseT.pp()}`
            );
        }

        const userType = baseT.toType;
        const def = this.resolve.getTypeDecl(userType);

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

        return this.concretizeType(matchingFields[0][1], this.makeSubst(userType));
    }

    /**
     * Helper to compute the type of `<baseExpr>[indexExpr]`. It:
     * 1. Makes sure indexExpr is of a number type
     * 2. Makes sure baseExpr is of an array type
     */
    private typeOfIndex(baseExpr: Expression, indexExpr: Expression): Type {
        const baseT = this.typeOfExpression(baseExpr);
        const indexT = this.typeOfExpression(indexExpr);

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

    /**
     * Type check an assignment. Make sure the lhs and rhs have the same type.
     */
    private tcAssignment(stmt: Assignment): void {
        const lhsT = this.typeOfExpression(stmt.lhs);
        const rhsT = this.typeOfExpression(stmt.rhs);

        if (!eq(lhsT, rhsT)) {
            throw new MIRTypeError(
                stmt.src,
                `Cannot assign ${stmt.rhs.pp()} of type ${rhsT.pp()} to ${stmt.lhs.pp()} of type ${lhsT.pp()}`
            );
        }
    }

    /**
     * Type check a branch. Just make sure the condition is a boolean.
     */
    private tcBranch(stmt: Branch): void {
        const condT = this.typeOfExpression(stmt.condition);

        if (!(condT instanceof BoolType)) {
            throw new MIRTypeError(
                stmt.condition.src,
                `Branch statement expects boolean not ${stmt.condition.pp()} of type ${condT.pp()}`
            );
        }
    }

    /**
     * Type check a load field. Make sure lhs and the loaded value are of the same type.
     * The heavy lifting is done in the `typeOfField` helper.
     */
    private tcLoadField(stmt: LoadField): void {
        const lhsT = this.typeOfExpression(stmt.lhs);
        const baseT = this.typeOfExpression(stmt.baseExpr);
        const fieldT = this.typeOfField(stmt.baseExpr, stmt.member);

        if (!eq(lhsT, fieldT)) {
            throw new MIRTypeError(
                stmt.src,
                `Cannot load field ${stmt.member} of struct ${
                    ((baseT as PointerType).toType as UserDefinedType).name
                } of type ${fieldT.pp()} in ${stmt.lhs.name} of type ${lhsT.pp()}`
            );
        }
    }

    /**
     * Type check a load index stmt. Make sure lhs and the loaded value are of the same type.
     * The heavy lifting is done in the `typeOfIndex` helper.
     */
    private tcLoadIndex(stmt: LoadIndex): void {
        const lhsT = this.typeOfExpression(stmt.lhs);
        const rhsT = this.typeOfIndex(stmt.baseExpr, stmt.indexExpr);

        if (!eq(lhsT, rhsT)) {
            throw new MIRTypeError(
                stmt.src,
                `Cannot load index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()} in ${
                    stmt.lhs.name
                } of type ${lhsT.pp()}`
            );
        }
    }

    /**
     * Type check a store field. Make sure rhs and the field type are the same.
     * The heavy lifting is done in the `typeOfField` helper.
     */
    private tcStoreField(stmt: StoreField): void {
        const fieldT = this.typeOfField(stmt.baseExpr, stmt.member);
        const baseT = this.typeOfExpression(stmt.baseExpr);
        const rhsT = this.typeOfExpression(stmt.rhs);

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
    }

    /**
     * Type check a store index stmt. Make sure rhs and the array base type are the same.
     * The heavy lifting is done in the `typeOfIndex` helper.
     */
    private tcStoreIndex(stmt: StoreIndex): void {
        const lhsT = this.typeOfIndex(stmt.baseExpr, stmt.indexExpr);
        const rhsT = this.typeOfExpression(stmt.rhs);

        if (!eq(rhsT, lhsT)) {
            throw new MIRTypeError(
                stmt.src,
                `Cannot store ${stmt.rhs.pp()} of type ${rhsT.pp()} into index ${stmt.indexExpr.pp()} of array ${stmt.baseExpr.pp()} of type ${rhsT.pp()}`
            );
        }
    }

    /**
     * Type check a return stmt. Make sure the returned values match the function signature.
     */
    private tcReturn(stmt: Return, fun: FunctionDefinition): void {
        const retTs = stmt.values.map((retExp) => this.typeOfExpression(retExp));
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
    }

    /**
     * Type check a function call. Makes sure that:
     * 1. Callee is a function
     * 2. The number of memory args match the function memory vars
     * 2. The number and types of the args match the function signature (after memory args instantiation)
     * 3. The number and types of returns match the function signature (after memory args instantiation)
     */
    private tcFunctionCall(stmt: FunctionCall): void {
        const calleeDef = this.resolve.getIdDecl(stmt.callee);

        if (!(calleeDef instanceof FunctionDefinition)) {
            throw new MIRTypeError(
                stmt.callee.src,
                `Expected function name not ${stmt.callee.pp()}`
            );
        }

        const subst = this.makeSubst(stmt);

        const concreteFormalArgTs = calleeDef.parameters.map((decl) =>
            this.concretizeType(decl.type, subst)
        );

        const concreteFormalRetTs = calleeDef.returns.map((typ) => this.concretizeType(typ, subst));

        if (concreteFormalArgTs.length !== stmt.args.length) {
            throw new MIRTypeError(
                stmt.src,
                `Function ${calleeDef.name} expected ${concreteFormalArgTs.length} arguments, instead ${stmt.args.length} given`
            );
        }

        if (concreteFormalRetTs.length !== stmt.lhss.length) {
            throw new MIRTypeError(
                stmt.src,
                `Function ${calleeDef.name} returns ${concreteFormalRetTs.length} values, instead ${stmt.lhss.length} lhs identifiers given`
            );
        }

        const actualArgTs = stmt.args.map((arg) => this.typeOfExpression(arg));
        const actualRetTs = stmt.lhss.map((ret) => this.typeOfExpression(ret));

        for (let i = 0; i < actualArgTs.length; i++) {
            if (!eq(concreteFormalArgTs[i], actualArgTs[i])) {
                throw new MIRTypeError(
                    stmt.args[i].src,
                    `In ${i}-th argument to ${calleeDef.name} expected ${concreteFormalArgTs[
                        i
                    ].pp()} instead given ${actualArgTs[i].pp()}`
                );
            }
        }

        for (let i = 0; i < actualRetTs.length; i++) {
            if (!eq(concreteFormalRetTs[i], actualRetTs[i])) {
                throw new MIRTypeError(
                    stmt.args[i].src,
                    `In ${i}-th return value of ${calleeDef.name} expected ${concreteFormalRetTs[
                        i
                    ].pp()} instead given ${actualRetTs[i].pp()}`
                );
            }
        }
    }

    /**
     * Type check a transaction call. Makes sure that:
     * 1. Callee is a function
     * 2. The number of memory args match the function memory vars
     * 2. The number and types of the args match the function signature (after memory args instantiation)
     * 3. There is one more return lhs than the function signature.
     * 4. The last return on the lhs is a boolean
     * 5. The reaming returns on the lhs match the function signature (after memory args instantiation)
     */
    private tcTransactionCall(stmt: TransactionCall): void {
        const calleeDef = this.resolve.getIdDecl(stmt.callee);

        if (!(calleeDef instanceof FunctionDefinition)) {
            throw new MIRTypeError(
                stmt.callee.src,
                `Expected function name not ${stmt.callee.pp()}`
            );
        }

        const subst = this.makeSubst(stmt);

        const concreteFormalArgTs = calleeDef.parameters.map((decl) =>
            this.concretizeType(decl.type, subst)
        );

        const concreteFormalRetTs = calleeDef.returns.map((typ) => this.concretizeType(typ, subst));

        if (concreteFormalArgTs.length !== stmt.args.length) {
            throw new MIRTypeError(
                stmt.src,
                `Transaction call to ${calleeDef.name} expected ${concreteFormalArgTs.length} arguments, instead ${stmt.args.length} given`
            );
        }

        if (concreteFormalRetTs.length + 1 !== stmt.lhss.length) {
            throw new MIRTypeError(
                stmt.src,
                `Transaction call to ${calleeDef.name} returns ${
                    concreteFormalRetTs.length + 1
                } values, instead ${stmt.lhss.length} lhs identifiers given`
            );
        }

        const actualArgTs = stmt.args.map((arg) => this.typeOfExpression(arg));
        const actualRetTs = stmt.lhss.map((ret) => this.typeOfExpression(ret));

        for (let i = 0; i < actualArgTs.length; i++) {
            if (!eq(concreteFormalArgTs[i], actualArgTs[i])) {
                throw new MIRTypeError(
                    stmt.args[i].src,
                    `In ${i}-th argument to ${calleeDef.name} expected ${concreteFormalArgTs[
                        i
                    ].pp()} instead given ${actualArgTs[i].pp()}`
                );
            }
        }

        for (let i = 0; i < concreteFormalRetTs.length; i++) {
            if (!eq(concreteFormalRetTs[i], actualRetTs[i])) {
                throw new MIRTypeError(
                    stmt.args[i].src,
                    `In ${i}-th return value of ${calleeDef.name} expected ${concreteFormalRetTs[
                        i
                    ].pp()} instead given ${actualRetTs[i].pp()}`
                );
            }
        }

        const lastRetIdx = actualRetTs.length - 1;
        const lastRetT = actualRetTs[lastRetIdx];

        if (!(lastRetT instanceof BoolType)) {
            throw new MIRTypeError(
                stmt.lhss[lastRetIdx].src,
                `Last return value of a transaction call should be boolean not ${lastRetT.pp()}`
            );
        }
    }

    /**
     * Check whether an array allocation is typed correctly. Checks that:
     *
     * 1. The given element type is a primitive type
     * 2. The size expression is of a numeric type
     * 3. The lhs is of the expected array type
     */
    private tcAllocArray(stmt: AllocArray): void {
        const elT = stmt.type;

        if (!this.resolve.isPrimitive(elT)) {
            throw new MIRTypeError(
                elT.src,
                `Cannot allocate an array of non-primitive type ${elT.pp()}`
            );
        }

        const sizeT = this.typeOfExpression(stmt.size);

        if (!(sizeT instanceof IntType)) {
            throw new MIRTypeError(
                stmt.size.src,
                `Size expression must be of numeric type not ${sizeT.pp()}`
            );
        }

        const resT = new PointerType(noSrc, new ArrayType(noSrc, elT), stmt.mem);
        const lhsT = this.typeOfExpression(stmt.lhs);

        if (!eq(resT, lhsT)) {
            throw new MIRTypeError(
                stmt.lhs.src,
                `LHS must be of type ${resT.pp()} not ${lhsT.pp()}`
            );
        }
    }

    /**
     * Check whether an array allocation is typed correctly. Checks that:
     *
     * 1. The given element type is a primitive type
     * 2. The size expression is of a numeric type
     * 3. The lhs is of the expected array type
     */
    private tcAllocStruct(stmt: AllocStruct): void {
        const structT = stmt.type;

        const decl = this.resolve.getTypeDecl(structT);

        if (!(decl instanceof StructDefinition)) {
            throw new MIRTypeError(stmt.type, `Type ${structT.pp()} must be a struct type.`);
        }

        const resT = new PointerType(noSrc, structT, stmt.mem);
        const lhsT = this.typeOfExpression(stmt.lhs);

        if (!eq(resT, lhsT)) {
            throw new MIRTypeError(
                stmt.lhs.src,
                `LHS must be of type ${resT.pp()} not ${lhsT.pp()}`
            );
        }
    }

    /**
     * Type check an assert. Just make sure the condition is a boolean.
     */
    private tcAssert(stmt: Assert): void {
        const condT = this.typeOfExpression(stmt.condition);

        if (!(condT instanceof BoolType)) {
            throw new MIRTypeError(
                stmt.condition.src,
                `Assert statement expects boolean not ${stmt.condition.pp()} of type ${condT.pp()}`
            );
        }
    }

    /**
     * Type check a statement inside of a function
     */
    private tcStatement(stmt: Statement, fun: FunctionDefinition): void {
        if (stmt instanceof Assignment) {
            this.tcAssignment(stmt);
            return;
        }

        if (stmt instanceof Branch) {
            this.tcBranch(stmt);
            return;
        }

        if (stmt instanceof Jump) {
            return;
        }

        if (stmt instanceof LoadField) {
            this.tcLoadField(stmt);
            return;
        }

        if (stmt instanceof LoadIndex) {
            this.tcLoadIndex(stmt);
            return;
        }

        if (stmt instanceof StoreField) {
            this.tcStoreField(stmt);
            return;
        }

        if (stmt instanceof StoreIndex) {
            this.tcStoreIndex(stmt);
            return;
        }

        if (stmt instanceof Return) {
            this.tcReturn(stmt, fun);
            return;
        }

        if (stmt instanceof FunctionCall) {
            this.tcFunctionCall(stmt);
            return;
        }

        if (stmt instanceof TransactionCall) {
            this.tcTransactionCall(stmt);
            return;
        }

        if (stmt instanceof Abort) {
            /// Nothing to do.
            return;
        }

        if (stmt instanceof AllocArray) {
            this.tcAllocArray(stmt);
            return;
        }

        if (stmt instanceof AllocStruct) {
            this.tcAllocStruct(stmt);
            return;
        }

        if (stmt instanceof Assert) {
            this.tcAssert(stmt);
            return;
        }

        throw new Error(`NYI statement ${stmt.pp()}`);
    }

    /**
     * Compute the type of an expression. Actual implementation in
     * `tcExpressionImpl`. Caches the results in `typeCache`.
     */
    private typeOfExpression(expr: Expression): Type {
        let res = this.typeCache.get(expr);

        if (res) {
            return res;
        }

        res = this.typeOfExpressionImpl(expr);

        this.typeCache.set(expr, res);
        return res;
    }

    /**
     * Compute the type of an identifier.
     */
    private typeOfIdentifier(expr: Identifier): Type {
        const decl = this.resolve.getIdDecl(expr);

        if (decl === undefined) {
            throw new MIRTypeError(expr.src, `Unknown identifier ${expr.name}`);
        }

        if (
            decl instanceof MemVariableDeclaration ||
            decl instanceof FreshMemVariableDeclaration ||
            decl instanceof FunctionDefinition
        ) {
            throw new MIRTypeError(
                expr.src,
                `Unexpected program variable in expression, not ${expr.name}`
            );
        }

        return decl.type;
    }

    /**
     * Compute the type of a UnaryExpression.
     */
    private typeOfUnaryOperation(expr: UnaryOperation): Type {
        const innerT = this.typeOfExpression(expr.subExpr);

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

    /**
     * Compute the type of a BinaryExpression.
     */
    private typeOfBinaryOperation(expr: BinaryOperation): Type {
        const lhsT = this.typeOfExpression(expr.leftExpr);
        const rhsT = this.typeOfExpression(expr.rightExpr);

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

    private typeOfExpressionImpl(expr: Expression): Type {
        if (expr instanceof BooleanLiteral) {
            return boolT;
        }

        if (expr instanceof NumberLiteral) {
            return expr.type;
        }

        if (expr instanceof Identifier) {
            return this.typeOfIdentifier(expr);
        }

        if (expr instanceof UnaryOperation) {
            return this.typeOfUnaryOperation(expr);
        }

        if (expr instanceof BinaryOperation) {
            return this.typeOfBinaryOperation(expr);
        }

        throw new Error(`Unknown expression ${expr.pp()}`);
    }

    private makeTypeSubst(arg: UserDefinedType | FunctionCall | TransactionCall): TypeSubstitution {
        let formals: TypeVariableDeclaration[];
        let actuals: Type[];
        let argDesc: string;

        if (arg instanceof UserDefinedType) {
            if (arg.typeArgs.length === 0) {
                return new Map();
            }

            const decl = this.resolve.getTypeDecl(arg);

            if (!(decl instanceof StructDefinition)) {
                throw new MIRTypeError(
                    arg.src,
                    `User defined type with args ${arg.pp()} should resolve to struct, not ${pp(
                        decl
                    )}`
                );
            }

            formals = decl.typeParameters;
            actuals = arg.typeArgs;
            argDesc = `Struct ${arg.name}`;
        } else {
            const calleeDef = this.resolve.getIdDecl(arg.callee);

            if (!(calleeDef instanceof FunctionDefinition)) {
                throw new MIRTypeError(
                    arg.callee.src,
                    `Expected function name not ${arg.callee.pp()}`
                );
            }

            formals = calleeDef.typeParameters;
            actuals = arg.typeArgs;
            argDesc = `Function ${arg.callee.pp()}`;
        }

        if (formals.length !== actuals.length) {
            throw new MIRTypeError(
                arg.src,
                `${argDesc} expects ${formals.length} memory parameters, instead ${actuals.length} given.`
            );
        }

        return new Map(zip(formals, actuals));
    }

    private makeMemSubst(arg: UserDefinedType | FunctionCall | TransactionCall): MemSubstitution {
        let formals: MemVariableDeclaration[];
        let actuals: MemDesc[];
        let argDesc: string;

        if (arg instanceof UserDefinedType) {
            if (arg.memArgs.length === 0) {
                return new Map();
            }

            const decl = this.resolve.getTypeDecl(arg);

            if (!(decl instanceof StructDefinition)) {
                throw new MIRTypeError(
                    arg.src,
                    `User defined type with args ${arg.pp()} should resolve to struct, not ${pp(
                        decl
                    )}`
                );
            }

            formals = decl.memoryParameters;
            actuals = arg.memArgs;
            argDesc = `Struct ${arg.name}`;
        } else {
            const calleeDef = this.resolve.getIdDecl(arg.callee);

            if (!(calleeDef instanceof FunctionDefinition)) {
                throw new MIRTypeError(
                    arg.callee.src,
                    `Expected function name not ${arg.callee.pp()}`
                );
            }

            formals = calleeDef.memoryParameters;
            actuals = arg.memArgs;
            argDesc = `Function ${arg.callee.pp()}`;
        }

        if (formals.length !== actuals.length) {
            throw new MIRTypeError(
                arg.src,
                `${argDesc} expects ${formals.length} memory parameters, instead ${actuals.length} given.`
            );
        }

        return new Map(zip(formals, actuals));
    }

    private makeSubst(arg: UserDefinedType | FunctionCall | TransactionCall): Substitution {
        return [this.makeMemSubst(arg), this.makeTypeSubst(arg)];
    }

    private concretizeType(t: Type, subst: Substitution): Type {
        const [memSubst, typeSubst] = subst;

        // Check if t is a mapped type var
        if (t instanceof UserDefinedType && t.memArgs.length === 0 && t.typeArgs.length === 0) {
            const decl = this.resolve.getTypeDecl(t);

            if (decl instanceof TypeVariableDeclaration) {
                const mappedT = typeSubst.get(decl);

                if (!mappedT) {
                    return t;
                }

                return this.concretizeType(mappedT, subst);
            }

            // Struct with no polymorphic params
            return t;
        }

        const concretizeMemDesc = (arg: MemDesc): MemConstant | Identifier => {
            if (arg instanceof MemConstant) {
                return arg;
            }

            const decl = this.resolve.getIdDecl(arg);

            if (!(decl instanceof MemVariableDeclaration)) {
                throw new MIRTypeError(arg.src, `Unexpected non-memory identifier in type`);
            }

            const newVal = memSubst.get(decl);

            if (newVal) {
                return newVal instanceof MemConstant
                    ? newVal
                    : new Identifier(arg.src, newVal.name);
            }

            return arg;
        };

        if (t instanceof UserDefinedType) {
            const concreteMemArgs = t.memArgs.map(concretizeMemDesc);
            const concreteTypeArgs = t.typeArgs.map((tArg) => this.concretizeType(tArg, subst));

            return new UserDefinedType(t.src, t.name, concreteMemArgs, concreteTypeArgs);
        }

        if (t instanceof PointerType) {
            return new PointerType(
                t.src,
                this.concretizeType(t.toType, subst),
                concretizeMemDesc(t.region)
            );
        }

        if (t instanceof ArrayType) {
            return new ArrayType(t.src, this.concretizeType(t.baseType, subst));
        }

        return t;
    }
}
