import { createSourceFile, ScriptTarget, SyntaxKind, VariableStatement, Node, Identifier, StringLiteral, NumericLiteral, ExpressionStatement, CallExpression } from 'typescript'
import { readFile as readFileAsync } from 'fs'
import { equal } from 'assert'
import { promisify } from 'util'
const readFile = promisify(readFileAsync)

enum ConstantKind {
  TAG_CLASS = 7,
  TAG_FIELD_REF = 9,
  TAG_METHOD_REF = 10,
  TAG_INTERFACE_METHOD_REF = 11,
  TAG_STRING = 8,
  TAG_INTEGER = 3,
  TAG_FLOAT = 4,
  TAG_LONG = 5,
  TAG_DOUBLE = 6,
  TAG_NAME_AND_TYPE = 12,
  TAG_UTF8 = 1,
  TAG_METHOD_HANDLE = 15,
  TAG_METHOD_TYPE = 16,
  TAG_INVOKE_DYNAMIC = 18,
}
enum AccessFlags {
  Public = 1,
  StaticPublic = 9,
}

type Constant = {
  kind: ConstantKind.TAG_UTF8
  str: string
} | {
  kind: ConstantKind.TAG_DOUBLE
  num: number
} | {
  kind: ConstantKind.TAG_CLASS
  name_index: number
} | {
  kind: ConstantKind.TAG_METHOD_REF
  class_index: number
  name_and_type_index: number
} | {
  kind: ConstantKind.TAG_NAME_AND_TYPE
  name_index: number
  description_index: number
} | {
  kind: ConstantKind.TAG_FIELD_REF
  class_index: number
  name_and_type_index: number
} | {
  kind: ConstantKind.TAG_STRING
  string_index: number
}
class ConstantPool {
  pool: Constant[] = []
  constructor () {}
  addString(str: string) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_UTF8 && i.str === str) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_UTF8,
      str
    })
    return this.pool.length
  }
  addStringObj(string_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_STRING && i.string_index === string_index) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_STRING,
      string_index
    })
    return this.pool.length
  }
  addNumber(num: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_DOUBLE && i.num === num) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_DOUBLE,
      num
    })
    return this.pool.length
  }
  addClass(name_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_CLASS && i.name_index === name_index) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_CLASS,
      name_index
    })
    return this.pool.length
  }
  addMethodRef(class_index: number, name_and_type_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_METHOD_REF
      && i.class_index === class_index
      && i.name_and_type_index === name_and_type_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_METHOD_REF,
      class_index,
      name_and_type_index
    })
    return this.pool.length
  }
  addNameAndType(name_index: number, description_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_NAME_AND_TYPE
      && i.name_index === name_index
      && i.description_index === description_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_NAME_AND_TYPE,
      name_index,
      description_index
    })
    return this.pool.length
  }
  addFieldRef(class_index: number, name_and_type_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_FIELD_REF
      && i.class_index === class_index
      && i.name_and_type_index === name_and_type_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_FIELD_REF,
      class_index,
      name_and_type_index
    })
    return this.pool.length
  }
  getMethodRef(cls: string, name: string, description: string) {
    return this.addMethodRef(
      this.addClass(this.addString(cls)),
      this.addNameAndType(
        this.addString(name),
        this.addString(description)
      )
    )
  }
  getFieldRef(cls: string, name: string, description: string) {
    return this.addFieldRef(
      this.addClass(this.addString(cls)),
      this.addNameAndType(this.addString(name), this.addString(description))
    )
  }
  write(buffer: Buffer, offset: number = 8) {
    offset = buffer.writeUInt16BE(this.pool.length + 1, offset)
    for (const c of this.pool) {
      offset = buffer.writeUInt8(c.kind, offset)
      switch (c.kind) {
        case ConstantKind.TAG_UTF8:
          offset = buffer.writeUInt16BE(c.str.length, offset)
          offset += buffer.write(c.str, offset, 'utf8')
          break
        case ConstantKind.TAG_DOUBLE:
          offset = buffer.writeDoubleBE(c.num, offset)
          break
        case ConstantKind.TAG_CLASS:
          offset = buffer.writeUInt16BE(c.name_index, offset)
          break
        case ConstantKind.TAG_METHOD_REF:
          offset = buffer.writeUInt16BE(c.class_index, offset)
          offset = buffer.writeUInt16BE(c.name_and_type_index, offset)
          break
        case ConstantKind.TAG_NAME_AND_TYPE:
          offset = buffer.writeUInt16BE(c.name_index, offset)
          offset = buffer.writeUInt16BE(c.description_index, offset)
          break
        case ConstantKind.TAG_FIELD_REF:
          offset = buffer.writeUInt16BE(c.class_index, offset)
          offset = buffer.writeUInt16BE(c.name_and_type_index, offset)
          break
        case ConstantKind.TAG_STRING:
          offset = buffer.writeUInt16BE(c.string_index, offset)
          break
        default:
          // @ts-ignore
          throw new TypeError(`ConstantKind: ${c.kind} is not supported`)
      }
    }

    return offset
  }
}

class ClassInfo {
  pool = new ConstantPool()
  thisClass = 'Main'
  superClass = 'java/lang/Object'
  main?: Buffer
  template = this.makeTemplate()
  constructor() {}
  objectConstructor(methodRef: number) {
    const buf = Buffer.from([
      0x2a, // aload_0
      0xb7, // invokespecial method_ref
      0x00, // methodRef
      0x00,
      0xB1, // return
    ])
    buf.writeUInt16BE(methodRef, 2)
    return buf
  }
  makePrint() {
    const buf = Buffer.from([
      0xB2, // getstatic
      0, 0, // field ref
      0x2A, // aload_0
      0xB6, // invoke_virtual
      0, 0, // method ref
      0xB1, // return
    ])
    const p = this.pool
    buf.writeUInt16BE(p.getFieldRef(
      'java/lang/System', 'out', 'Ljava/io/PrintStream;'
    ), 1)
    buf.writeUInt16BE(p.getMethodRef(
      'java/io/PrintStream', 'println', '(Ljava/lang/String;)V'
    ), 5)
    return buf
  }
  makeCodeAttr(code: Buffer) {
    const buf = Buffer.alloc(1024)
    let offset = 0
    offset = buf.writeUInt16BE(0x10, offset) // max stack
    offset = buf.writeUInt16BE(0x10, offset) // max locals
    offset = buf.writeUInt32BE(code.byteLength, offset) // code length
    offset += code.copy(buf, offset) // code
    offset = buf.writeUInt16BE(0, offset) // exception table length
    offset = buf.writeUInt16BE(0, offset) // attr length
    return buf.slice(0, offset)
  }
  makeMethodInfo(access: AccessFlags, name: string, description: string, code: Buffer) {
    const buf = Buffer.alloc(1024)
    let offset = 0
    offset = buf.writeUInt16BE(access, offset) // access
    offset = buf.writeUInt16BE(this.pool.addString(name), offset) // name
    offset = buf.writeUInt16BE(this.pool.addString(description), offset) // description
    offset = buf.writeUInt16BE(1, offset) // attr count

    const codeAttr = this.makeCodeAttr(code)
    offset = buf.writeUInt16BE(this.pool.addString('Code'), offset) // Code attribute
    offset = buf.writeUInt32BE(codeAttr.byteLength, offset) // attr length
    offset += codeAttr.copy(buf, offset)
    return buf.slice(0, offset)
  }
  makeTemplate() {
    const p = this.pool
    const thisClass = p.addClass(p.addString(this.thisClass))
    const superClass = p.addClass(p.addString(this.superClass))
    const constructorNT = p.addNameAndType(p.addString('<init>'), p.addString('()V'))
    const superRef = this.pool.addMethodRef(superClass, constructorNT)
    const ctorMI = this.makeMethodInfo(AccessFlags.Public, '<init>', '()V', this.objectConstructor(superRef))
    const printMI = this.makeMethodInfo(AccessFlags.StaticPublic, 'print', '(Ljava/lang/String;)V', this.makePrint())

    return {
      thisClass,
      superClass,
      ctorMI,
      printMI,
    }
  }
  write(buffer: Buffer) {
    if (!this.main) {
      throw new TypeError(`Main code is not set`)
    }
    const {
      thisClass,
      superClass,
      ctorMI,
      printMI,
    } = this.template
    const main = this.makeMethodInfo(AccessFlags.StaticPublic, 'main', '([Ljava/lang/String;)V', this.main)
    const methods: Buffer[] = [ctorMI, printMI, main]

    let offset = 0
    offset = buffer.writeUInt32BE(0xcafebabe, offset)
    offset = buffer.writeUInt16BE(0, offset)
    offset = buffer.writeUInt16BE(55, offset)
    offset = this.pool.write(buffer, offset)
    offset = buffer.writeUInt16BE(0x21, offset) // access flags: SUPER,PUBLIC
    offset = buffer.writeUInt16BE(thisClass, offset) // this class
    offset = buffer.writeUInt16BE(superClass, offset) // super class
    offset = buffer.writeUInt16BE(0, offset) // interface count
    offset = buffer.writeUInt16BE(0, offset) // fields count
    offset = buffer.writeUInt16BE(methods.length, offset) // methods count
    // methods
    for (const m of  methods) {
      offset += m.copy(buffer, offset)
    }
    // methods end
    offset = buffer.writeUInt16BE(0, offset) // attr count

    return offset
  }
}

class Assembler {
  private offset = 0
  private p = this.cls.pool
  constructor (private buf: Buffer, private cls: ClassInfo) {}
  declareVariable(varIndex: number, index: number) {
    this.offset = this.buf.writeUInt8(0x13, this.offset) // ldc_w
    this.offset = this.buf.writeUInt16BE(index, this.offset)
    this.offset = this.buf.writeUInt8(0x3a, this.offset) // astore
    this.offset = this.buf.writeUInt8(varIndex, this.offset)
  }
  callPrint(varIndex: number) {
    this.offset = this.buf.writeUInt8(0x19, this.offset) // aload
    this.offset = this.buf.writeUInt8(varIndex, this.offset)
    this.offset = this.buf.writeUInt8(0xB8, this.offset) // invokestatic
    this.offset = this.buf.writeUInt16BE(this.p.getMethodRef(
      'Main', 'print', '(Ljava/lang/String;)V'
    ), this.offset)
  }
  end() {
    this.offset = this.buf.writeUInt8(0xB1, this.offset) // return
  }
  getBuf() {
    return this.buf.slice(0, this.offset)
  }
}

function getLiteral(node?: Node) {
  if (typeof node === 'undefined') throw new TypeError('Variable must be initialized')
  if (node.kind === SyntaxKind.StringLiteral) {
    return (node as StringLiteral).text
  } else if (node.kind === SyntaxKind.NumericLiteral) {
    return parseFloat((node as NumericLiteral).text)
  } else {
    throw new TypeError(`Initializer ${node.kind} is not supported`)
  }
}

export function compile(source: string) {
  type Variable = ({
    type: 'string'
    value: string
  } | {
    type: 'number'
    value: number
  }) & {
    name: string
  }
  const sourceFile = createSourceFile('main.ts', source, ScriptTarget.ES2020)
  const cls = new ClassInfo()
  const asm = new Assembler(Buffer.alloc(8192), cls)
  const p = cls.pool
  const vars: Variable[] = []
  const varIndexByName = (name: string) => vars.findIndex(i => i.name === name)

  for (const i of sourceFile.statements) {
    if (i.kind === SyntaxKind.VariableStatement) {
      const s = i as VariableStatement
      equal(s.declarationList.kind, SyntaxKind.VariableDeclarationList)
      for (const decl of s.declarationList.declarations) {
        equal(decl.kind, SyntaxKind.VariableDeclaration)
        equal(decl.name.kind, SyntaxKind.Identifier)
        const name = (decl.name as Identifier).escapedText as string
        const value = getLiteral(decl.initializer)

        console.log('decl', name, value)

        if (typeof value === 'number') {
          asm.declareVariable(vars.length, p.addNumber(value))
          vars.push({
            name,
            type: 'number',
            value
          })
        } else if (typeof value === 'string') {
          asm.declareVariable(vars.length, p.addStringObj(
            p.addString(value)
          ))
          vars.push({
            name,
            type: 'string',
            value
          })
        } else {
          throw new TypeError(`Wrong type: ${typeof value}`)
        }
      }
    } else if (i.kind === SyntaxKind.ExpressionStatement) {
      const e = (i as ExpressionStatement).expression
      if (e.kind === SyntaxKind.CallExpression) {
        const c = e as CallExpression
        equal(c.expression.kind, SyntaxKind.Identifier)
        const func = (c.expression as Identifier).escapedText
        const args = c.arguments
        if (func !== 'print') {
          throw new TypeError(`Only print is allowed to be called`)
        }
        if (args.length !== 1) {
          throw new TypeError(`Only print only accept one variable`)
        }
        const arg = args[0]
        if (arg.kind !== SyntaxKind.Identifier) {
          throw new TypeError(`Print only support variable`)
        }
        const idx = varIndexByName((arg as Identifier).escapedText as string)
        if (idx === -1) {
          throw new TypeError(`Variable is not found`)
        }
        asm.callPrint(idx)
      } else {
        throw new TypeError(`Unsupported kind: ${SyntaxKind[i.kind]}(${i.kind})`)
      }
    } else {
      throw new TypeError(`Unsupported kind: ${SyntaxKind[i.kind]}(${i.kind})`)
    }
  }
  asm.end()
  cls.main = asm.getBuf()
  // const mainCode = Buffer.from([
  //   0x12, // ldc
  //   0, // index
  //   0xB8, // invoke_static
  //   0, 0, // method ref
  //   0xB1, // return
  // ])
  // mainCode.writeUInt8(this.pool.addStringObj(this.pool.addString('Hello world')), 1)
  // mainCode.writeUInt16BE(this.pool.getMethodRef(
  //   'Main', 'print', '(Ljava/lang/String;)V'
  // ), 3)
  return cls
}
