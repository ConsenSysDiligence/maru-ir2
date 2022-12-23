import {
    Definition,
    StructDefinition,
    IntType,
    BoolType,
    UserDefinedType,
    PointerType,
    ArrayType,
    FunctionDefinition,
    NumberLiteral,
    BooleanLiteral,
    Identifier,
    UnaryOperation,
    Expression,
    BinaryOperator,
    BinaryOperation,
    Assignment,
    LoadField,
    LoadIndex,
    StoreField,
    StoreIndex,
    Branch,
    Return,
    Statement,
    TerminatorStmt,
    Jump,
    VariableDeclaration,
    MemVariableDeclaration,
    TypeVariableDeclaration,
    PegsRange,
    noSrc,
    Src,
    BaseSrc,
    MemConstant,
    FunctionCall,
    TransactionCall,
    Abort,
    Node,
    Type,
    MemDesc,
    AllocArray,
    AllocStruct,
    Assert
} from "../ir";
import { BasicBlock, CFG, Edge } from "../ir/cfg";
import { MIRSyntaxError } from "../utils";

type ParseOptions = {
    startRule: string;
};

export function parseProgram(str: string): Definition[] {
    try {
        return parse(str, { startRule: "Program" } as ParseOptions);
    } catch (e) {
        if (e instanceof SyntaxError) {
            throw new MIRSyntaxError(Src.fromPegsRange(e.location), e.message);
        }

        throw e;
    }
}

function buildBinaryExpression(
    head: Expression,
    tail: Array<[BinaryOperator, Expression, PegsRange]>,
    src: PegsRange,
    opts: ParseOptions
): Node {
    return tail.reduce((acc, [curOp, curVal, curLoc]) => {
        const loc = new Src(src.start, curLoc.end);
        return new BinaryOperation(loc, acc, curOp, curVal);
    }, head);
}

/**
 * Build a `CFG` from a list of raw `Statement`s or pairs `[label, Statement]` parsed from a
 * .rsimp file.
 */
export function buildCFG(
    rawStmts: Array<Statement | [string, Statement]>,
    opts: ParseOptions,
    rawBodyLoc: PegsRange
): CFG {
    // 1. Build basic blocks
    const nodes: BasicBlock[] = [];
    const edges: Edge[] = [];
    let entry: BasicBlock | undefined;
    const exits: BasicBlock[] = [];
    const bodyLoc = Src.fromPegsRange(rawBodyLoc);

    // For empty functions build a CFG with a single empty BB
    if (rawStmts.length === 0) {
        entry = new BasicBlock("entry");
        entry.statements.push(new Return(bodyLoc, []));
        return new CFG([entry], [], entry, [entry]);
    }

    let curStmts: Statement[] = [];
    let curLabel: string | undefined;
    const firstStmt = rawStmts[0];

    // We require all functions to start with a label.
    if (firstStmt instanceof Statement) {
        throw new MIRSyntaxError(
            firstStmt.src,
            `Expected first statement in function to be labeled.`
        );
    }

    const addBB = () => {
        const newBB = new BasicBlock(curLabel as string);
        newBB.statements = curStmts;

        if (entry === undefined) {
            entry = newBB;
        }

        nodes.push(newBB);
    };

    // First split the list of statements into basic blocks
    for (const el of rawStmts) {
        if (el instanceof Statement) {
            curStmts.push(el);
        } else {
            if (curLabel !== undefined) {
                addBB();
            }

            curLabel = el[0];
            curStmts = [el[1]];
        }
    }

    // Add last BB
    addBB();

    // Find edges
    const bbMap = new Map<string, BasicBlock>(nodes.map((n) => [n.label, n]));
    const getBB = (label: string, loc: BaseSrc): BasicBlock => {
        const res = bbMap.get(label);

        if (res === undefined) {
            throw new MIRSyntaxError(loc, `Unknown label ${label}`);
        }
        return res;
    };

    for (let i = 0; i < nodes.length; i++) {
        const bb = nodes[i];

        // This should be disallowed by the grammar
        if (bb.statements.length === 0) {
            throw new Error(`Unexpected error: Found empty basic block.`);
        }

        const lastStmt = bb.statements[bb.statements.length - 1];
        if (!(lastStmt instanceof TerminatorStmt)) {
            throw new MIRSyntaxError(
                lastStmt.src,
                `Found basic block that ends in non-terminator statement ${lastStmt.pp()}.`
            );
        }

        if (lastStmt instanceof Return || lastStmt instanceof Abort) {
            exits.push(bb);
            continue;
        }

        if (lastStmt instanceof Branch) {
            const trueBB = getBB(lastStmt.trueLabel, lastStmt.src);
            const falseBB = getBB(lastStmt.falseLabel, lastStmt.src);

            bb.addOutgoing(trueBB, lastStmt.condition);
            bb.addOutgoing(
                falseBB,
                new UnaryOperation(lastStmt.condition.src, "!", lastStmt.condition)
            );
            continue;
        }

        if (lastStmt instanceof Jump) {
            const destBB = getBB(lastStmt.label, lastStmt.src);

            bb.addOutgoing(destBB, new BooleanLiteral(noSrc, true));
            continue;
        }

        throw new Error(`Unknown terminator statement ${lastStmt.pp()}`);
    }

    if (entry === undefined) {
        throw new Error(`Missing entry block`);
    }

    return new CFG(nodes, edges, entry, exits);
}
