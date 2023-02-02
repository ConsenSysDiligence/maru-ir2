import {
    UserDefinedType,
    FunctionCall,
    TransactionCall,
    TypeVariableDeclaration,
    Type,
    StructDefinition,
    FunctionDefinition,
    MemVariableDeclaration,
    MemDesc,
    ArrayType,
    BoolType,
    IntType,
    MemConstant,
    PointerType
} from "../ir";
import { MIRTypeError, pp, zip } from "../utils";
import { TypeSubstitution, MemSubstitution, Substitution, Scope } from "./resolving";

function makeTypeSubst(
    arg: UserDefinedType | FunctionCall | TransactionCall,
    global: Scope
): TypeSubstitution {
    let formals: TypeVariableDeclaration[];
    let actuals: Type[];
    let argDesc: string;

    if (arg instanceof UserDefinedType) {
        if (arg.typeArgs.length === 0) {
            return new Map();
        }

        const decl = global.getTypeDecl(arg);

        if (!(decl instanceof StructDefinition)) {
            throw new MIRTypeError(
                arg.src,
                `User defined type with args ${arg.pp()} should resolve to struct, not ${pp(decl)}`
            );
        }

        formals = decl.typeParameters;
        actuals = arg.typeArgs;
        argDesc = `Struct ${arg.name}`;
    } else {
        const calleeDef = global.get(arg.callee.name);

        if (!(calleeDef instanceof FunctionDefinition)) {
            throw new MIRTypeError(arg.callee.src, `Expected function name not ${arg.callee.pp()}`);
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

function makeMemSubst(
    arg: UserDefinedType | FunctionCall | TransactionCall,
    global: Scope
): MemSubstitution {
    let formals: MemVariableDeclaration[];
    let actuals: MemDesc[];
    let argDesc: string;

    if (arg instanceof UserDefinedType) {
        if (arg.memArgs.length === 0) {
            return new Map();
        }

        const decl = global.getTypeDecl(arg);

        if (!(decl instanceof StructDefinition)) {
            throw new MIRTypeError(
                arg.src,
                `User defined type with args ${arg.pp()} should resolve to struct, not ${pp(decl)}`
            );
        }

        formals = decl.memoryParameters;
        actuals = arg.memArgs;
        argDesc = `Struct ${arg.name}`;
    } else {
        const calleeDef = global.get(arg.callee.name);

        if (!(calleeDef instanceof FunctionDefinition)) {
            throw new MIRTypeError(arg.callee.src, `Expected function name not ${arg.callee.pp()}`);
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

export function makeSubst(
    arg: UserDefinedType | FunctionCall | TransactionCall,
    scope: Scope
): Substitution {
    return [makeMemSubst(arg, scope), makeTypeSubst(arg, scope)];
}

export function concretizeType(t: Type, subst: Substitution, scope: Scope): Type {
    const [memSubst, typeSubst] = subst;

    // Check if t is a mapped type var
    if (t instanceof UserDefinedType && t.memArgs.length === 0 && t.typeArgs.length === 0) {
        const decl = scope.getTypeDecl(t);

        if (decl instanceof TypeVariableDeclaration) {
            const mappedT = typeSubst.get(decl);

            return mappedT ? mappedT : t;
        }

        // Struct with no polymorphic params
        return t;
    }

    const concretizeMemDesc = (arg: MemDesc): MemDesc => {
        if (arg instanceof MemConstant) {
            return arg;
        }

        const decl = scope.get(arg.name);

        // Shouldn't happen at this point
        if (!(decl instanceof MemVariableDeclaration)) {
            throw new Error(
                `Internal error: Expected a memory desc for ${arg.pp()}, not ${pp(decl)}`
            );
        }

        const newVal = memSubst.get(decl);

        return newVal ? newVal : arg;
    };

    if (t instanceof UserDefinedType) {
        const concreteMemArgs = t.memArgs.map(concretizeMemDesc);
        const concreteTypeArgs = t.typeArgs.map((tArg) => concretizeType(tArg, subst, scope));

        return new UserDefinedType(t.src, t.name, concreteMemArgs, concreteTypeArgs);
    }

    if (t instanceof PointerType) {
        return new PointerType(
            t.src,
            concretizeType(t.toType, subst, scope),
            concretizeMemDesc(t.region)
        );
    }

    if (t instanceof ArrayType) {
        return new ArrayType(t.src, concretizeType(t.baseType, subst, scope));
    }

    return t;
}

export function isConcrete(t: Type, scope: Scope): boolean {
    if (t instanceof BoolType || t instanceof IntType) {
        return true;
    }

    if (t instanceof ArrayType) {
        return isConcrete(t.baseType, scope);
    }

    if (t instanceof PointerType) {
        if (!(t.region instanceof MemConstant)) {
            return false;
        }

        return isConcrete(t.toType, scope);
    }

    if (t instanceof UserDefinedType) {
        const decl = scope.getTypeDecl(t);

        if (decl === undefined || decl instanceof TypeVariableDeclaration) {
            return false;
        }

        for (const memArg of t.memArgs) {
            if (!(memArg instanceof MemConstant)) {
                return false;
            }
        }

        for (const typeArg of t.typeArgs) {
            if (!isConcrete(typeArg, scope)) {
                return false;
            }
        }

        return true;
    }

    throw new Error(`NYI type ${t.pp()}`);
}
