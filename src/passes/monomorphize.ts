import { Program } from "../interp";
import {
    AllocArray,
    AllocMap,
    AllocStruct,
    ArrayType,
    BoolType,
    FunctionCall,
    FunctionDefinition,
    GlobalVariable,
    IntType,
    MemConstant,
    PointerType,
    StructDefinition,
    Type,
    UserDefinedType,
    copy
} from "../ir";
import { STOP_WALK, assert, forAll, walk, zip } from "../utils";
import { concretizeMemDesc, concretizeType, isConcrete, walkType } from "./poly";
import { Resolving, Scope, Substitution } from "./resolving";

export type MonomorphicDefM = Map<
    string,
    [StructDefinition | FunctionDefinition, [MemConstant[], Type[]]]
>;

export type TopLevelDef = FunctionDefinition | StructDefinition | GlobalVariable;
/**
 * Return true IFF the top-level `def` is polymorphic (i.e. has type/mem variables)
 */
function isDefPoly(def: TopLevelDef): boolean {
    if (def instanceof GlobalVariable) {
        return false;
    }

    return def.memoryParameters.length > 0 || def.typeParameters.length > 0;
}

export class Monomorphize {
    constructor(
        private readonly program: Program,
        private readonly resolving: Resolving
    ) {}

    /**
     * Given a *concrete* type t, compute a unique string representing t that can be used
     * in the name of a monomorphic variant
     */
    private getConcreteTypeIdentifier(t: Type): string {
        if (t instanceof PointerType) {
            return `ptr_${t.region.name}_${this.getConcreteTypeIdentifier(t.toType)}`;
        }

        if (t instanceof ArrayType) {
            return `arr_${this.getConcreteTypeIdentifier(t.baseType)}`;
        }

        if (t instanceof UserDefinedType) {
            return `usr_${t.name}$${t.memArgs.map((mArg) => mArg.name).join("_")}$${t.typeArgs
                .map((tArg) => this.getConcreteTypeIdentifier(tArg))
                .join("_")}`;
        }

        if (t instanceof IntType || t instanceof BoolType) {
            return t.pp();
        }

        throw new Error(`NYI getConcreteTypeIdentifier(${t.pp()})`);
    }

    /**
     * Given a struct or function definition `def`, and a list of *concrete* memories and types with which
     * it is to be instantiated, compute the monomorphic name for `def`.
     */
    private getMonoName(
        def: StructDefinition | FunctionDefinition,
        concreteMems: MemConstant[],
        concreteTypes: Type[]
    ): string {
        return `${def.name}$${concreteMems.map((m) => m.name).join("_")}$${concreteTypes
            .map((t) => this.getConcreteTypeIdentifier(t))
            .join("_")}`;
    }

    /**
     * Given a *concrete* type t, walk over all its sub-types (and recursively
     * the field types of any referenced structs) and build a map from the
     * monomrphic names of any concrete polymorphic type instances, to the
     * corresponding original def and the concrete memories/types with which
     * they are instantiated.
     */
    private accumulateConcreteStructDefs(t: Type, scope: Scope): MonomorphicDefM {
        const res: MonomorphicDefM = new Map();

        walkType(
            t,
            (subT) => {
                if (!(subT instanceof UserDefinedType)) {
                    return;
                }

                // Not a polymorphic type. Not interesting.
                if (subT.memArgs.length === 0 && subT.typeArgs.length === 0) {
                    return;
                }

                const def = scope.getTypeDecl(subT);

                if (!(def instanceof StructDefinition)) {
                    return;
                }

                // subT is already concrete here (thanks to walkType)
                const name = `${def.name}$${subT.memArgs
                    .map((m) => m.name)
                    .join("_")}$${subT.typeArgs
                    .map((t) => this.getConcreteTypeIdentifier(t))
                    .join("_")}`;

                res.set(name, [def, [subT.memArgs, subT.typeArgs]]);
            },
            scope
        );

        return res;
    }

    private accumulateMonomorphicVariants(p: Program): MonomorphicDefM {
        const monomorphicDefs: MonomorphicDefM = new Map();

        // Gather monomorphic structs from global variables
        for (const def of p) {
            if (def instanceof GlobalVariable) {
                // def.type must already be concrete here
                for (const [name, entry] of this.accumulateConcreteStructDefs(
                    def.type,
                    this.resolving.global
                )) {
                    monomorphicDefs.set(name, entry);
                }
            }
        }

        // Initialize worklist
        const wl: Array<[FunctionDefinition, [MemConstant[], Type[]]]> = [];
        for (const def of p) {
            if (
                !(
                    def instanceof FunctionDefinition &&
                    def.memoryParameters.length === 0 &&
                    def.typeParameters.length === 0
                )
            ) {
                continue;
            }

            wl.push([def, [[], []]]);
        }

        const visited = new Set<string>();

        // Iterate till fixpoint:
        //  1. Get a monomorphic function variant F
        //  2. Add F to the monomorphic map
        //  2. Walk over all types in F, concretize them, and add them to the monomorphic map
        //  3. Walk over all functon calls in F, concretize the callee, and add it to the worklist
        while (wl.length > 0) {
            const [fun, [mems, types]] = wl.pop() as [FunctionDefinition, [MemConstant[], Type[]]];

            const name = this.getMonoName(fun, mems, types);

            // Already found this variant
            if (visited.has(name)) {
                continue;
            }

            visited.add(name);

            if (mems.length > 0 || types.length > 0) {
                monomorphicDefs.set(name, [fun, [mems, types]]);
            }

            const subst: Substitution = [
                new Map(zip(fun.memoryParameters, mems)),
                new Map(zip(fun.typeParameters, types))
            ];
            const funScope = this.resolving.getScope(fun);

            walk(fun, (nd) => {
                if (nd instanceof Type) {
                    const concreteT = concretizeType(nd, subst, funScope);
                    for (const [name, entry] of this.accumulateConcreteStructDefs(
                        concreteT,
                        funScope
                    )) {
                        monomorphicDefs.set(name, entry);
                    }
                }

                if (nd instanceof FunctionCall) {
                    const concreteMems = nd.memArgs.map((memDesc) =>
                        concretizeMemDesc(memDesc, subst[0], funScope)
                    );
                    const concreteTypes = nd.typeArgs.map((tArg) =>
                        concretizeType(tArg, subst, funScope)
                    );
                    const callee = this.resolving.global.get(nd.callee.name) as FunctionDefinition;

                    wl.push([callee, [concreteMems, concreteTypes]]);
                }
            });
        }

        return monomorphicDefs;
    }

    private replacePolymorphicNodes<T extends TopLevelDef>(
        def: T,
        scope: Scope,
        subst: Substitution
    ): void {
        walk(def, (n) => {
            if (n instanceof PointerType) {
                n.region = concretizeMemDesc(n.region, subst[0], scope);
            }

            if (n instanceof AllocArray || n instanceof AllocMap || n instanceof AllocStruct) {
                n.mem = concretizeMemDesc(n.mem, subst[0], scope);
            }

            // Polymorphic type def
            if (n instanceof UserDefinedType && (n.memArgs.length > 0 || n.typeArgs.length > 0)) {
                const concreteT = concretizeType(n, subst, scope) as UserDefinedType;
                const nDef = scope.get(concreteT.name);

                assert(
                    nDef instanceof StructDefinition,
                    `Unexpected def {0} in replacePolymorphicNodes on type {1}`,
                    def,
                    n
                );
                assert(
                    isConcrete(concreteT, scope),
                    `Unexpected non-concrete type {0} in replacePolymorphicNodes`,
                    n
                );

                n.name = this.getMonoName(
                    nDef,
                    concreteT.memArgs as MemConstant[],
                    concreteT.typeArgs
                );
                n.memArgs = [];
                n.typeArgs = [];

                return STOP_WALK;
            }

            // Polymorphic fun call
            if (n instanceof FunctionCall && (n.memArgs.length > 0 || n.typeArgs.length > 0)) {
                const nDef = scope.get(n.callee.name);

                assert(
                    nDef instanceof FunctionDefinition,
                    `Unexpected def {0} in replacePolymorphicNodes on call {1}`,
                    def,
                    n
                );

                const concreteMems = n.memArgs.map((mArg) =>
                    concretizeMemDesc(mArg, subst[0], scope)
                );
                const concreteTs = n.typeArgs.map((tArg) => concretizeType(tArg, subst, scope));

                assert(
                    forAll(concreteMems, (arg) => arg instanceof MemConstant),
                    `Unexpected non-concrete mem in {0}`,
                    n
                );

                assert(
                    forAll(concreteTs, (arg) => isConcrete(arg, scope)),
                    `Unexpected non-concrete type in {0}`,
                    n
                );

                n.callee.name = this.getMonoName(nDef, concreteMems as MemConstant[], concreteTs);
                n.memArgs = [];
                n.typeArgs = [];

                return STOP_WALK;
            }

            return undefined;
        });
    }

    private concretizeDef<T extends StructDefinition | FunctionDefinition>(
        orig: T,
        concreteMems: MemConstant[],
        concreteTypes: Type[]
    ): T {
        const newDef = copy(orig);
        const subst: Substitution = [
            new Map(zip(orig.memoryParameters, concreteMems)),
            new Map(zip(orig.typeParameters, concreteTypes))
        ];

        newDef.name = this.getMonoName(orig, concreteMems, concreteTypes);
        newDef.memoryParameters = [];
        newDef.typeParameters = [];

        const origScope = this.resolving.getScope(orig);

        this.replacePolymorphicNodes(newDef, origScope, subst);
        return newDef;
    }

    /**
     * Given a program p, and a map of *all* monomorphic variants need by `p`,
     * return a new program, with only monomorphic types/functions. We do this in 2 steps:
     *
     * 1. For all entries in the `monomorphicDefs` map, add the monomorphized instance to the new program
     * 2. For all non-polymorphic defs in the original program, copy them over, while replacing all references
     *  to poloymorphic types iniside them with their monomorphic variants.
     */
    private monomorphize(p: Program, monomorphicDefs: MonomorphicDefM): Program {
        const newProg: Program = [];

        // 1. For all entries in the `monomorphicDefs` map, add the monomorphized instance to the new program
        for (const [, [def, [concreteMems, concreteTypes]]] of monomorphicDefs) {
            newProg.push(this.concretizeDef(def, concreteMems, concreteTypes));
        }

        // 2. For all non-polymorphic defs in the original program, copy them over, while replacing all references
        for (const def of p) {
            if (isDefPoly(def as TopLevelDef)) {
                continue;
            }

            const newDef = copy(def);
            const scope =
                def instanceof GlobalVariable
                    ? this.resolving.global
                    : this.resolving.getScope(def as StructDefinition | FunctionDefinition);

            this.replacePolymorphicNodes(newDef as TopLevelDef, scope, [new Map(), new Map()]);
            newProg.push(newDef);
        }

        return newProg;
    }

    run(): Program {
        const monomorphicDefs: MonomorphicDefM = this.accumulateMonomorphicVariants(this.program);

        for (const [name, [def, [concreteMemes, concreteTypes]]] of monomorphicDefs.entries()) {
            console.error(
                `${name} => ${def} ${concreteMemes.map((m) => m.name).join(", ")} ${concreteTypes
                    .map((m) => m.pp())
                    .join(", ")}`
            );
        }

        return this.monomorphize(this.program, monomorphicDefs);
    }
}
