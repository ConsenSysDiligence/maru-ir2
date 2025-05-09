{
    expected;
    error;
    peg$anyExpectation;
}

Program
    = __ t: (d: Definition __ { return d; })* { return t; };

/// Definitions

Definition
    = StructDefinition
    / FunctionDefinition
    / GlobalVariable

GlobalVariable
    = VAR __ name: Identifier __ COLON __ typ: Type __ "=" __ initialValue: GlobalVarLiteral {
        return new GlobalVariable(Src.fromPegsRange(location()), name, typ, initialValue);
    }

GlobalVarLiteral
    = NumberLiteral
    / BooleanLiteral
    / ArrayLiteral
    / StructLiteral
    / MapLiteral

LiteralList
    = head: GlobalVarLiteral tail: (__ COMMA __ decl: GlobalVarLiteral { return decl; })* {
        return [head, ...tail];
    }

ArrayLiteral
    = LBRACKET __ literals: LiteralList ?__ RBRACKET {
        return new ArrayLiteral(Src.fromPegsRange(location()), literals !== null ? literals : []);
    }

KeyValue
    = key: GlobalVarLiteral __ COLON __ value: GlobalVarLiteral { return [key, value]; }

KeyValueList
    = head: KeyValue tail: (__ COMMA __ kv: KeyValue { return kv; })* {
        return [head, ...tail];
    }

MapLiteral
    = LCBRACE __ kvs: KeyValueList? __ RCBRACE {
        return new MapLiteral(Src.fromPegsRange(location()), kvs !== null ? kvs : []);
    }

FieldLiteral
    = field: Identifier __ COLON __ value: GlobalVarLiteral { return [field, value]; }

FieldLiteralList
    = head: FieldLiteral tail: (__ COMMA __ decl: FieldLiteral { return decl; })* {
        return [head, ...tail];
    }

StructLiteral
    = LCBRACE __ fields: FieldLiteralList __ RCBRACE {
        return new StructLiteral(Src.fromPegsRange(location()), fields);
    }

TypeVariableDeclaration
    = id: Identifier { return new TypeVariableDeclaration(Src.fromPegsRange(location()), id); }

MemVariableDeclaration
    = id: Identifier { return new MemVariableDeclaration(Src.fromPegsRange(location()), id); }

TypeIdList
    = head: TypeVariableDeclaration tail: (__ COMMA __ decl: TypeVariableDeclaration { return decl; })* {
        return [head, ...tail];
    }

MemIdList
    = head: MemVariableDeclaration tail: (__ COMMA __ decl: MemVariableDeclaration { return decl; })* {
        return [head, ...tail];
    }

PolyParams
    = LT __ mVars: MemIdList __ SEMICOLON? __ GT { return [mVars, []] as [MemVariableDeclaration[], TypeVariableDeclaration[]]; }
    / LT __ SEMICOLON __ tVars: TypeIdList __ GT { return [[], tVars] as [MemVariableDeclaration[], TypeVariableDeclaration[]]; }
    / LT __ mVars: MemIdList __ SEMICOLON __ tVars: TypeIdList __ GT { return [mVars, tVars] as [MemVariableDeclaration[], TypeVariableDeclaration[]]; }

StructField
    = name: Identifier __ COLON __ type: Type __ SEMICOLON { return [name, type]; }

StructDefinition
    = STRUCT __ name: Identifier __ pParams: PolyParams? __ LCBRACE __ fields: (f: StructField __ { return f; })* __ RCBRACE {
        const mArgs = pParams === null ? [] : pParams[0];
        const tArgs = pParams === null ? [] : pParams[1];

        return new StructDefinition(
            Src.fromPegsRange(location()),
            mArgs,
            tArgs,
            name,
            fields === null ? [] : fields);
    }

VariableDecl
    = name: Identifier __ COLON __ typ: Type {
        return new VariableDeclaration(Src.fromPegsRange(location()), name, typ);
    }

FunctionParameters
    = head: VariableDecl
      tail: (__ COMMA __ d: VariableDecl { return d; })* {
        return [head, ...tail];
      }

FunBody
    = LCBRACE __ stmts: (stmt: (LabeledStatement / Statement) __ { return stmt; })* RCBRACE {
        return buildCFG(stmts, location());
    }

FunReturns
    = t: Type  { return [t]; }
    / LPAREN __ retTList: TypeList __ RPAREN { return retTList; }

FunctionDefinition
    = FUNCTION __ name: Identifier __  pParams: PolyParams? __ LPAREN __ params: FunctionParameters? __ RPAREN rets: (__ COLON __ retT: FunReturns { return retT; })? __ locals: (LOCALS __ p: FunctionParameters __ SEMICOLON { return p; })? __ body: FunBody? {
        const mArgs = pParams === null ? [] : pParams[0];
        const tArgs = pParams === null ? [] : pParams[1];

        return new FunctionDefinition(
            Src.fromPegsRange(location()),
            mArgs,
            tArgs,
            name,
            params === null ? [] : params,
            locals === null ? [] : locals,
            rets === null ? [] : rets,
            body === null ? undefined : body);
    }

MemVar
    = name: Identifier { return new MemIdentifier(Src.fromPegsRange(location()), name); }

MemConst
    = HASHTAG name: Identifier { return new MemConstant(Src.fromPegsRange(location()), name); }

MemDesc
    = MemVar
    / MemConst

MemDescList
    = head: MemDesc tail: (__ COMMA __ d: MemDesc {return d;})* {
        return [head, ...tail];
    }

TypeList
    = head: Type tail: (__ COMMA __ t: Type {return t;})* {
        return [head, ...tail];
    }

PolymorphicInstantiations
    = LT __ mInst: MemDescList __ SEMICOLON? __ GT { return [mInst, []] as [MemDesc[], Type[]]; }
    / LT __ SEMICOLON __ tInst: TypeList __ GT { return [[], tInst] as [MemDesc[], Type[]]; }
    / LT __ mInst: MemDescList __ SEMICOLON __ tInst: TypeList __ GT { return [mInst, tInst] as [MemDesc[], Type[]]; }

/// Types
UserDefinedType
    = name: Identifier __ polyArgs: PolymorphicInstantiations? {
        const memArgs = polyArgs === null ? [] : polyArgs[0];
        const typeArgs = polyArgs === null ? [] : polyArgs[1];
        
        return new UserDefinedType(Src.fromPegsRange(location()), name, memArgs, typeArgs);
    }

MapType
    = MAP __ LPAREN __ keyT: Type __ COMMA __ valT: Type __ RPAREN {
        return new MapType(Src.fromPegsRange(location()), keyT, valT);
    }

PrimitiveType
    = IntType
    / BOOL { return new BoolType(Src.fromPegsRange(location())); }
    / NEVER { return new NeverType(Src.fromPegsRange(location())); }
    / UserDefinedType
    / LPAREN innerT: Type RPAREN { return innerT; }
    / MapType

IntType
    = sign:("u" / "i") nbits:([0-9]+ {return Number(text())})  { return new IntType(Src.fromPegsRange(location()), nbits, sign == "i"); }

PointerOrArrayType
    = head: PrimitiveType tail: ((__ STAR __ MemDesc) / __ LBRACKET __ RBRACKET)* {
        return tail.reduce(
            (acc: Type, el: any) => {
                if (el[1] === "*") {
                    return new PointerType(Src.fromPegsRange(location()), acc, el[3]);
                }

                return new ArrayType(Src.fromPegsRange(location()), acc);
            },
            head
        )
    }

Type = PointerOrArrayType

/// Statements

LabeledStatement
    = label: Identifier __ COLON __ stmt: Statement { return [label, stmt]; }

Statement
    = Assignment
    / Branch
    / LoadIndex
    / LoadField
    / StoreIndex
    / StoreField
    / Jump
    / Return
    / FunctionCall
    / TransactionCall
    / Abort 
    / Alloc
    / Assert
    / Contains

Assignment
    = lhs: Identifier __ ":=" __ rhs: Expression __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new Assignment(Src.fromPegsRange(location()), lhsNode, rhs);
    }

Branch
    = BRANCH __ condition: Expression __ trueLabel: Identifier __ falseLabel: Identifier __ SEMICOLON {
        return new Branch(Src.fromPegsRange(location()), condition, trueLabel, falseLabel);
    }

LoadIndex
    = LOAD __ base: Expression __ LBRACKET __ index: Expression __ RBRACKET __ IN __ lhs: Identifier __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new LoadIndex(Src.fromPegsRange(location()), lhsNode, base, index);
    }

LoadField
    = LOAD __ base: Expression "." member: Identifier __ IN __ lhs: Identifier __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new LoadField(Src.fromPegsRange(location()), lhsNode, base, member);
    }

StoreIndex
    = STORE __ rhs: Expression __ IN __ base: Expression __ LBRACKET __ index: Expression __ RBRACKET __ SEMICOLON {
        return new StoreIndex(Src.fromPegsRange(location()), base, index, rhs);
    }

StoreField
    = STORE __ rhs: Expression __ IN __ base: Expression "." member: Identifier  __ SEMICOLON {
        return new StoreField(Src.fromPegsRange(location()), base, member, rhs);
    }

Jump
    = JUMP  __ label: Identifier __ SEMICOLON {
        return new Jump(Src.fromPegsRange(location()), label);
    }

ExprList
    = head: Expression
      tail: (__ COMMA __ e: Expression { return e; })* {
        return [head, ...tail];
      }

Return
    = RETURN __ values: (Expression / (LPAREN __ exprs: ExprList __ RPAREN { return exprs; }))? __ SEMICOLON {
        const vs = values === null ? [] : values instanceof Expression ? [values] : values;
        return new Return(Src.fromPegsRange(location()), vs);
    }

IdentifierExp
    = Identifier { return new Identifier(Src.fromPegsRange(location()), text()); }

IdExpList
    = head: IdentifierExp tail: (__ COMMA __ id: IdentifierExp {return id;})* {
        return [head, ...tail];
    }

FunctionCall
    = lhss: (ids: IdExpList __ ":=" __ { return ids; })? CALL __ callee: IdentifierExp polyArgs: PolymorphicInstantiations? __ LPAREN __ args: ExprList? __ RPAREN SEMICOLON {
        const memArgs = polyArgs === null ? [] : polyArgs[0];
        const typeArgs = polyArgs === null ? [] : polyArgs[1];

        return new FunctionCall(
            Src.fromPegsRange(location()),
            lhss === null ? [] : lhss,
            callee,
            memArgs,
            typeArgs,
            args === null ? [] : args
        );
    }

TransactionCall
    = lhss: (ids: IdExpList __ ":=" __ { return ids; })? TRANSCALL __ callee: IdentifierExp polyArgs: PolymorphicInstantiations? __ LPAREN __ args: ExprList? __ RPAREN SEMICOLON {
        const memArgs = polyArgs === null ? [] : polyArgs[0];
        const typeArgs = polyArgs === null ? [] : polyArgs[1];

        return new TransactionCall(
            Src.fromPegsRange(location()),
            lhss === null ? [] : lhss,
            callee,
            memArgs,
            typeArgs,
            args === null ? [] : args
        );
    }

Abort
    = ABORT __ SEMICOLON {
        return new Abort(Src.fromPegsRange(location()));
    }

Alloc = AllocArr / AllocStruct / AllocMap

AllocStruct
    = lhs: IdentifierExp __ ":=" __ ALLOC __ typeT: UserDefinedType __ IN __ mem: MemDesc __ SEMICOLON {
        return new AllocStruct(Src.fromPegsRange(location()), lhs, typeT, mem);
    }

AllocArr
    = lhs: IdentifierExp __ ":=" __ ALLOC __ typeT: Type __ LBRACKET __ size: Expression  __ RBRACKET __ IN __ mem: MemDesc __ SEMICOLON {
        return new AllocArray(Src.fromPegsRange(location()), lhs, typeT, size, mem)
    }

AllocMap
    = lhs: IdentifierExp __ ":=" __ ALLOC __ typeT: MapType __ IN __ mem: MemDesc __ SEMICOLON {
        return new AllocMap(Src.fromPegsRange(location()), lhs, typeT, mem)
    }

Assert
    = ASSERT __ condition: Expression __ SEMICOLON {
        return new Assert(Src.fromPegsRange(location()), condition);
    }

Contains
    = lhs: IdentifierExp __ ":=" __ mapExpr: Expression __ CONTAINS __ keyExpr: Expression __ SEMICOLON {
        return new Contains(Src.fromPegsRange(location()), lhs, mapExpr, keyExpr);
    }

/// Expressions
HexDigit =
    [0-9a-f]i

HexNumber =
    "0x"i digits: HexDigit+ {
        return [BigInt(text()), 16]
    }

DecDigit =
    [0-9]

DecNumber =
    DecDigit+ {
        return [BigInt(text()), 10];
    }

MaybeNegNumber
    = sign: "-"? __ num: (HexNumber / DecNumber) {
        if (sign === null) {
            return num;
        }

        return [-num[0], num[1]];
    }

NumberLiteral =
    value: MaybeNegNumber "_" type: IntType {
        return new NumberLiteral(Src.fromPegsRange(location()), value[0], value[1], type);
    }

BooleanLiteral =
    val: (TRUE / FALSE) {
        return new BooleanLiteral(Src.fromPegsRange(location()), val === "true");
    }

Literal
    = NumberLiteral
    / BooleanLiteral

Cast
    = type: IntType __ LPAREN __ expr: Expression __ RPAREN {
        return new Cast(Src.fromPegsRange(location()), type, expr);
    }

PrimitiveExpression
    = Literal
    / (id: Identifier { return new Identifier(Src.fromPegsRange(location()), id); })
    / LPAREN __ e: Expression __ RPAREN { return e; }
    / Cast

UnaryExpression =
    (
        operator: UnaryOperator __ expr: UnaryExpression {
            return new UnaryOperation(Src.fromPegsRange(location()), operator, expr);
        }
    )
    / PrimitiveExpression

UnaryOperator =
    "-"
    / "!"
    / "~"

PowerExpression =
    head: UnaryExpression
    tail: (__ op: "**" __ e: UnaryExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

MultiplicativeOperator =
    $("*") { return text() as BinaryOperator; }
    / $("/") { return text() as BinaryOperator; }
    / $("%") { return text() as BinaryOperator; }

MultiplicativeExpression =
    head: PowerExpression
    tail: (__ op: MultiplicativeOperator __ e: PowerExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

AdditiveOperator =
    $("+") { return text() as BinaryOperator; }
    / $("-") { return text() as BinaryOperator; }

AdditiveExpression =
    head: MultiplicativeExpression
    tail: (__ op: AdditiveOperator __ e: MultiplicativeExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

ShiftExpression =
    head: AdditiveExpression
    tail: (__ op: ShiftOperator __ e: AdditiveExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

ShiftOperator =
    $("<<") { return text() as BinaryOperator; }
    / $(">>") { return text() as BinaryOperator; }

BitwiseANDExpression =
    head: ShiftExpression
    tail: (__ op: "&" __ e: ShiftExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

BitwiseXORExpression =
    head: BitwiseANDExpression
    tail: (__ op: "^" __ e: BitwiseANDExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

BitwiseORExpression =
    head: BitwiseXORExpression
    tail: (__ op: "|" __ e: BitwiseXORExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

RelationalExpression =
    (
        left: BitwiseORExpression __ op: RelationalOperator __ right: BitwiseORExpression {
            return new BinaryOperation(Src.fromPegsRange(location()), left, op, right);
        }
    )
    / BitwiseORExpression

RelationalOperator =
    '<=' { return text(); }
    / '>=' { return text(); }
    / '<' { return text(); }
    / '>' { return text(); }

EqualityExpression =
    (
        left: BitwiseORExpression __ op: EqualityOperator __ right: BitwiseORExpression {
            return new BinaryOperation(Src.fromPegsRange(location()), left, op, right);
        }
    )
    / RelationalExpression

EqualityOperator =
    "==" { return text(); }
    / "!=" { return text(); }

LogicalANDExpression =
    head: EqualityExpression
    tail: (__ op: "&&" __ e: EqualityExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }

LogicalORExpression =
    head: LogicalANDExpression
    tail: (__ op: "||" __ e: LogicalANDExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location());
    }


Expression = LogicalORExpression 

/// Misc

// Keywords
STRUCT = "struct"
FUNCTION = "fun"
LCBRACE = "{"
RCBRACE = "}"
LPAREN = "("
RPAREN = ")"
LBRACKET = "["
RBRACKET = "]"
COLON = ":"
BOOL = "bool"
SEMICOLON = ";"
LT = "<"
GT = ">"
COMMA = ","
STAR = "*"
TRUE="true"
FALSE="false"
BRANCH="branch"
JUMP="jump"
RETURN="return"
LOAD="load"
STORE="store"
IN="in"
LOCALS="locals"
HASHTAG="#"
CALL="call"
TRANSCALL="trans_call"
ABORT="abort"
ALLOC="alloc"
ASSERT="assert"
VAR="var"
NEVER="never"
MAP="map"
CONTAINS="contains"

Keyword
    = STRUCT
    / FUNCTION
    / BOOL
    / TRUE
    / FALSE
    / BRANCH
    / LOAD
    / STORE 
    / IN
    / JUMP
    / RETURN
    / LOCALS
    / CALL
    / TRANSCALL
    / ABORT
    / ALLOC
    / ASSERT
    / VAR
    / MAP

Identifier =
    !((Keyword ![a-zA-Z0-9_]) / IntType) id:([a-zA-Z_][a-zA-Z0-9_$]*) { return text(); }
// Whitespace

PrimitiveWhiteSpace =
    "\t"
    / "\v"
    / "\f"
    / " "
    / "\u00A0"
    / "\uFEFF"
    / Zs

WhiteSpace "whitespace" =
    PrimitiveWhiteSpace
    / LineTerminator PrimitiveWhiteSpace* ("*" / "///")

// Separator, Space

Zs =
    [\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]

LineTerminator =
    [\n\r\u2028\u2029]

__ =
    (WhiteSpace / LineTerminator)*