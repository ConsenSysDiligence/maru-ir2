import {
    Abort,
    AllocArray,
    AllocStruct,
    ArrayType,
    Assert,
    Assignment,
    BaseSrc,
    BinaryOperation,
    BooleanLiteral,
    BoolType,
    Branch,
    Cast,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    MemConstant,
    MemDesc,
    MemIdentifier,
    MemVariableDeclaration,
    Node,
    noSrc,
    NoSrc,
    NumberLiteral,
    PegsRange,
    PointerType,
    Return,
    Src,
    StoreField,
    StoreIndex,
    StructDefinition,
    TransactionCall,
    TypeVariableDeclaration,
    UnaryOperation,
    UserDefinedType,
    VariableDeclaration
} from "../";
import { getOrErr, MIRError } from "../utils";
import { BasicBlock, CFG } from "./cfg";

export type PlainRepresentationHeader = {
    id: number;
    nodeType: string;
    src?: PegsRange;
};

export type PlainRepresentation = PlainRepresentationHeader & { [key: string]: any };

export class MIRPlainRepresentationError extends MIRError {
    constructor(msg: string, public readonly node?: Node) {
        super(msg);
    }
}

function header(node: Node): PlainRepresentationHeader {
    return {
        id: node.id,
        nodeType: node.constructor.name,
        src: srcToPlain(node.src)
    };
}

function srcToPlain(src: BaseSrc): PegsRange | undefined {
    if (src instanceof Src) {
        return {
            start: src.start,
            end: src.end
        };
    }

    if (src instanceof NoSrc) {
        return undefined;
    }

    throw new MIRPlainRepresentationError(
        `Unable to produce plain representation for source location "${src.constructor.name}"`
    );
}

function plainToSrc(plain: PegsRange | undefined): BaseSrc {
    if (plain === undefined) {
        return noSrc;
    }

    if ("start" in plain && "end" in plain) {
        return new Src(plain.start, plain.end);
    }

    throw new MIRPlainRepresentationError(
        `Unable to handle plain source location ${JSON.stringify(plain)}`
    );
}

function cfgToPlain(cfg: CFG): any {
    const nodes: any[] = [];
    const edges: any[] = [];

    for (const bb of cfg.nodes.values()) {
        nodes.push({
            label: bb.label,
            statements: bb.statements.map(nodeToPlain)
        });
    }

    cfg.entry.bfs((bb) => {
        for (const edge of bb.outgoing) {
            edges.push({
                from: edge.from.label,
                to: edge.to.label,
                predicate: edge.predicate ? nodeToPlain(edge.predicate) : undefined
            });
        }
    });

    return {
        entry: cfg.entry.label,
        exits: cfg.exits.map((bb) => bb.label),
        nodes,
        edges
    };
}

function plainToCfg(plain: any): CFG {
    const cache = new Map<string, BasicBlock>();
    const nodes: BasicBlock[] = [];

    for (const plainBb of plain.nodes) {
        const bb = new BasicBlock(plainBb.label);

        bb.statements = plainBb.statements.map(plainToNode);

        nodes.push(bb);

        cache.set(bb.label, bb);
    }

    for (const plainEdge of plain.edges) {
        const from = getOrErr(
            cache,
            plainEdge.from,
            `Missing basic block for edge "from" label "${plain.entry}"`
        );

        const to = getOrErr(
            cache,
            plainEdge.to,
            `Missing basic block for edge "from" label "${plain.entry}"`
        );

        const predicate = plainEdge.predicate ? plainToNode(plainEdge.predicate) : undefined;

        from.addOutgoing(to, predicate);
    }

    const entry = getOrErr(
        cache,
        plain.entry,
        `Missing basic block for entry label "${plain.entry}"`
    );

    const exits = plain.exits.map((label: string) =>
        getOrErr(cache, label, `Missing basic block for exit label "${label}"`)
    );

    return new CFG(nodes, entry, exits);
}

export function nodeToPlain(node: Node): PlainRepresentation {
    if (node instanceof NumberLiteral) {
        return {
            ...header(node),

            value: node.value.toString(),
            radix: node.radix,
            type: nodeToPlain(node.type)
        };
    }

    if (node instanceof BooleanLiteral) {
        return {
            ...header(node),

            value: node.value
        };
    }

    if (node instanceof Cast) {
        return {
            ...header(node),

            toType: nodeToPlain(node.toType),
            subExpr: nodeToPlain(node.subExpr)
        };
    }

    if (node instanceof Identifier) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof UnaryOperation) {
        return {
            ...header(node),

            op: node.op,
            subExpr: nodeToPlain(node.subExpr)
        };
    }

    if (node instanceof BinaryOperation) {
        return {
            ...header(node),

            op: node.op,
            leftExpr: nodeToPlain(node.leftExpr),
            rightExpr: nodeToPlain(node.rightExpr)
        };
    }

    if (node instanceof Abort) {
        return header(node);
    }

    if (node instanceof AllocArray) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            type: nodeToPlain(node.type),
            size: nodeToPlain(node.size),
            mem: nodeToPlain(node.mem)
        };
    }

    if (node instanceof AllocStruct) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            type: nodeToPlain(node.type),
            mem: nodeToPlain(node.mem)
        };
    }

    if (node instanceof Assert) {
        return {
            ...header(node),

            condition: nodeToPlain(node.condition)
        };
    }

    if (node instanceof Assignment) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof Branch) {
        return {
            ...header(node),

            condition: nodeToPlain(node.condition),
            trueLabel: node.trueLabel,
            falseLabel: node.falseLabel
        };
    }

    if (node instanceof FunctionCall) {
        return {
            ...header(node),

            lhss: node.lhss.map(nodeToPlain),
            callee: nodeToPlain(node.callee),
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain),
            args: node.args.map(nodeToPlain)
        };
    }

    if (node instanceof Jump) {
        return {
            ...header(node),

            label: node.label
        };
    }

    if (node instanceof LoadField) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            baseExpr: nodeToPlain(node.baseExpr),
            member: node.member
        };
    }

    if (node instanceof LoadIndex) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            baseExpr: nodeToPlain(node.baseExpr),
            indexExpr: nodeToPlain(node.indexExpr)
        };
    }

    if (node instanceof Return) {
        return {
            ...header(node),

            values: node.values.map(nodeToPlain)
        };
    }

    if (node instanceof StoreField) {
        return {
            ...header(node),

            baseExpr: nodeToPlain(node.baseExpr),
            member: node.member,
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof StoreIndex) {
        return {
            ...header(node),

            baseExpr: nodeToPlain(node.baseExpr),
            indexExpr: nodeToPlain(node.indexExpr),
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof TransactionCall) {
        return {
            ...header(node),

            lhss: node.lhss.map(nodeToPlain),
            callee: nodeToPlain(node.callee),
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain),
            args: node.args.map(nodeToPlain)
        };
    }

    if (node instanceof IntType) {
        return {
            ...header(node),

            signed: node.signed,
            nbits: node.nbits
        };
    }

    if (node instanceof BoolType) {
        return header(node);
    }

    if (node instanceof ArrayType) {
        return {
            ...header(node),

            baseType: nodeToPlain(node.baseType)
        };
    }

    if (node instanceof PointerType) {
        return {
            ...header(node),

            toType: nodeToPlain(node.toType),
            region: nodeToPlain(node.region)
        };
    }

    if (node instanceof UserDefinedType) {
        return {
            ...header(node),

            name: node.name,
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain)
        };
    }

    if (node instanceof MemConstant) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof MemIdentifier) {
        return {
            ...header(node),

            name: node.name,
            out: node.out
        };
    }

    if (node instanceof MemVariableDeclaration) {
        return {
            ...header(node),

            name: node.name,
            fresh: node.fresh
        };
    }

    if (node instanceof TypeVariableDeclaration) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof VariableDeclaration) {
        return {
            ...header(node),

            name: node.name,
            type: nodeToPlain(node.type)
        };
    }

    if (node instanceof FunctionDefinition) {
        return {
            ...header(node),

            name: node.name,
            memoryParameters: node.memoryParameters.map(nodeToPlain),
            typeParameters: node.typeParameters.map(nodeToPlain),
            parameters: node.parameters.map(nodeToPlain),
            locals: node.locals.map(nodeToPlain),
            returns: node.returns.map(nodeToPlain),
            body: node.body ? cfgToPlain(node.body) : undefined
        };
    }

    if (node instanceof StructDefinition) {
        return {
            ...header(node),

            name: node.name,
            memoryParameters: node.memoryParameters.map(nodeToPlain),
            typeParameters: node.typeParameters.map(nodeToPlain),
            fields: node.fields.map(([name, type]) => [name, nodeToPlain(type)])
        };
    }

    throw new MIRPlainRepresentationError(
        `Unable to produce plain representation for node "${node.constructor.name}"`,
        node
    );
}

export function plainToNode(plain: PlainRepresentation): Node {
    if (plain.nodeType === NumberLiteral.name) {
        return new NumberLiteral(
            plainToSrc(plain.src),
            BigInt(plain.value),
            plain.radix,
            plainToNode(plain.type) as IntType
        );
    }

    if (plain.nodeType === BooleanLiteral.name) {
        return new BooleanLiteral(plainToSrc(plain.src), plain.value);
    }

    if (plain.nodeType === Cast.name) {
        return new Cast(
            plainToSrc(plain.src),
            plainToNode(plain.toType) as IntType,
            plainToNode(plain.subExpr)
        );
    }

    if (plain.nodeType === Identifier.name) {
        return new Identifier(plainToSrc(plain.src), plain.name);
    }

    if (plain.nodeType === UnaryOperation.name) {
        return new UnaryOperation(plainToSrc(plain.src), plain.op, plainToNode(plain.subExpr));
    }

    if (plain.nodeType === BinaryOperation.name) {
        return new BinaryOperation(
            plainToSrc(plain.src),
            plainToNode(plain.leftExpr),
            plain.op,
            plainToNode(plain.rightExpr)
        );
    }

    if (plain.nodeType === Abort.name) {
        return new Abort(plainToSrc(plain.src));
    }

    if (plain.nodeType === AllocArray.name) {
        return new AllocArray(
            plainToSrc(plain.src),
            plainToNode(plain.lhs) as Identifier,
            plainToNode(plain.type),
            plainToNode(plain.size),
            plainToNode(plain.mem) as MemDesc
        );
    }

    if (plain.nodeType === AllocStruct.name) {
        return new AllocStruct(
            plainToSrc(plain.src),
            plainToNode(plain.lhs) as Identifier,
            plainToNode(plain.type) as UserDefinedType,
            plainToNode(plain.mem) as MemDesc
        );
    }

    if (plain.nodeType === Assert.name) {
        return new Assert(plainToSrc(plain.src), plainToNode(plain.condition));
    }

    if (plain.nodeType === Assignment.name) {
        return new Assignment(
            plainToSrc(plain.src),
            plainToNode(plain.lhs) as Identifier,
            plainToNode(plain.rhs)
        );
    }

    if (plain.nodeType === Branch.name) {
        return new Branch(
            plainToSrc(plain.src),
            plainToNode(plain.condition),
            plain.trueLabel,
            plain.falseLabel
        );
    }

    if (plain.nodeType === FunctionCall.name) {
        return new FunctionCall(
            plainToSrc(plain.src),
            plain.lhss.map(plainToNode),
            plainToNode(plain.callee) as Identifier,
            plain.memArgs.map(plainToNode),
            plain.typeArgs.map(plainToNode),
            plain.args.map(plainToNode)
        );
    }

    if (plain.nodeType === Jump.name) {
        return new Jump(plainToSrc(plain.src), plain.label);
    }

    if (plain.nodeType === LoadField.name) {
        return new LoadField(
            plainToSrc(plain.src),
            plainToNode(plain.lhs) as Identifier,
            plainToNode(plain.baseExpr),
            plain.member
        );
    }

    if (plain.nodeType === LoadIndex.name) {
        return new LoadIndex(
            plainToSrc(plain.src),
            plainToNode(plain.lhs) as Identifier,
            plainToNode(plain.baseExpr),
            plainToNode(plain.indexExpr)
        );
    }

    if (plain.nodeType === Return.name) {
        return new Return(plainToSrc(plain.src), plain.values.map(plainToNode));
    }

    if (plain.nodeType === StoreField.name) {
        return new StoreField(
            plainToSrc(plain.src),
            plainToNode(plain.baseExpr),
            plain.member,
            plainToNode(plain.rhs)
        );
    }

    if (plain.nodeType === StoreIndex.name) {
        return new StoreIndex(
            plainToSrc(plain.src),
            plainToNode(plain.baseExpr),
            plainToNode(plain.indexExpr),
            plainToNode(plain.rhs)
        );
    }

    if (plain.nodeType === TransactionCall.name) {
        return new TransactionCall(
            plainToSrc(plain.src),
            plain.lhss.map(plainToNode),
            plainToNode(plain.callee) as Identifier,
            plain.memArgs.map(plainToNode),
            plain.typeArgs.map(plainToNode),
            plain.args.map(plainToNode)
        );
    }

    if (plain.nodeType === IntType.name) {
        return new IntType(plainToSrc(plain.src), plain.nbits, plain.signed);
    }

    if (plain.nodeType === BoolType.name) {
        return new BoolType(plainToSrc(plain.src));
    }

    if (plain.nodeType === ArrayType.name) {
        return new ArrayType(plainToSrc(plain.src), plainToNode(plain.baseType));
    }

    if (plain.nodeType === PointerType.name) {
        return new PointerType(
            plainToSrc(plain.src),
            plainToNode(plain.toType),
            plainToNode(plain.region) as Identifier | MemConstant
        );
    }

    if (plain.nodeType === UserDefinedType.name) {
        return new UserDefinedType(
            plainToSrc(plain.src),
            plain.name,
            plain.memArgs.map(plainToNode),
            plain.typeArgs.map(plainToNode)
        );
    }

    if (plain.nodeType === MemConstant.name) {
        return new MemConstant(plainToSrc(plain.src), plain.name);
    }

    if (plain.nodeType === MemIdentifier.name) {
        return new MemIdentifier(plainToSrc(plain.src), plain.name, plain.out);
    }

    if (plain.nodeType === MemVariableDeclaration.name) {
        return new MemVariableDeclaration(plainToSrc(plain.src), plain.name, plain.fresh);
    }

    if (plain.nodeType === TypeVariableDeclaration.name) {
        return new TypeVariableDeclaration(plainToSrc(plain.src), plain.name);
    }

    if (plain.nodeType === VariableDeclaration.name) {
        return new VariableDeclaration(plainToSrc(plain.src), plain.name, plainToNode(plain.type));
    }

    if (plain.nodeType === FunctionDefinition.name) {
        return new FunctionDefinition(
            plainToSrc(plain.src),
            plain.memoryParameters.map(plainToNode),
            plain.typeParameters.map(plainToNode),
            plain.name,
            plain.parameters.map(plainToNode),
            plain.locals.map(plainToNode),
            plain.returns.map(plainToNode),
            plain.body ? plainToCfg(plain.body) : undefined
        );
    }

    if (plain.nodeType === StructDefinition.name) {
        return new StructDefinition(
            plainToSrc(plain.src),
            plain.memoryParameters.map(plainToNode),
            plain.typeParameters.map(plainToNode),
            plain.name,
            (plain.fields as Array<[string, any]>).map(([name, type]) => [name, plainToNode(type)])
        );
    }

    throw new MIRPlainRepresentationError(
        `Unable to handle plain representation ${JSON.stringify(plain)}`
    );
}
