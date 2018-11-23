
import { Display, Mixin, o } from 'elt'


export const Inited = Symbol('inited')
export const Persist = Symbol('persistent')
export const BlockInit = Symbol('block-init')
export const InitPromise = Symbol('init-promise')

export interface BlockInstantiator<B extends Block = Block> {
  new(app: App): B
}


const requirements = Symbol('requirements')

/**
 * The base class to create services.
 *
 * Services are meant to be used by *composition*, and not through extension.
 * Do not subclass a service unless its state is the exact same type.
 */
export class Block {

  /**
   * Set to true in a subclass if you want this block to stay instanciated
   * even if no other block need it.
   */
  constructor(public app: App) {
    // The following any is mandatory since the o_state from app is known just as
    // a basic Observable<State> and not the particular subclass we are using now.
  }

  registry = this.app.registry
  is_static = false

  ;[Inited] = false
  ;[Persist] = false
  ;[InitPromise] = null as null | Promise<void>

  private [requirements] = new Set<Block | Object>()
  observers: o.ReadonlyObserver<any, any>[] = []

  mark(s: Set<Function>) {
    s.add(this.constructor)
    this[requirements].forEach(req => {
      var proto = req.constructor
      if (req instanceof o.Observable) {
        s.add(req.get().constructor)
      } if (req instanceof Block && !s.has(proto)) {
        req.mark(s)
      } else {
        s.add(proto)
      }
    })
  }

  runOnRequirementsAndSelf(fn: (b: Block) => void, mark = new Set<Block>()) {
    mark.add(this)
    this[requirements].forEach(req => {
      if (req instanceof Block && !mark.has(req)) {
        req.runOnRequirementsAndSelf(fn, mark)
      }
    })
    fn(this)
  }

  addViews(views: {[name: string]: () => Node}) {
    this.runOnRequirementsAndSelf(() => {

    })
  }

  observe<T, U = void>(a: o.RO<T>, cbk: o.ObserverFunction<T, U>): o.ReadonlyObserver<T, U>
  observe<T, U = void>(a: o.RO<T>, cbk: o.ObserverFunction<T, U>, immediate: true): o.ReadonlyObserver<T, U> | null
  observe<T, U = void>(a: o.RO<T>, cbk: o.ReadonlyObserver<T, U> | o.ObserverFunction<T, U>, immediate?: boolean): o.ReadonlyObserver<T, U> | null {
    if (immediate && !(a instanceof o.Observable)) {
      typeof cbk === 'function' ? cbk(a as T, new o.Changes(a as T)) : cbk.call(a as T)
      return null
    }

    const ob: o.ReadonlyObservable<T> = a instanceof o.Observable ? a : o(a)
    const observer = typeof cbk === 'function' ?  ob.createObserver(cbk) : cbk
    this.observers.push(observer)
    if (this[Inited]) observer.startObserving()
    return observer
  }

  startObservables() {
    for (var o of this.observers) {
      o.startObserving()
    }
  }

  /**
   * Wait for all the required blocks to init
   */
  async [BlockInit](): Promise<void> {
    if (this[InitPromise]) {
      await this[InitPromise]
      return
    }

    var requirement_blocks = Array.from(this[requirements]).filter(b => b instanceof Block) as Block[]
    // This is where we wait for all the required blocks to end their init.
    await Promise.all(requirement_blocks.map(b => b[BlockInit]()))
    // Now we can init.
    await this.init()
    this.startObservables()
    this[Inited] = true
  }

  /**
   * Extend this method to run code whenever the block is created and
   * integrated.
   */
  async init(): Promise<any> {

  }

  stopObservables() {
    for (var o of this.observers) {
      o.stopObserving()
    }
  }

  /**
   * Extend this method to run code whenever this block is cleared from the app.
   */
  async deinit(): Promise<any> {

  }

  isActive() {
    return this.app.registry.active_blocks.has(this.constructor as BlockInstantiator<this>)
  }

  /**
   *
   * @param block_def
   */
  require<B extends Block>(block_def: BlockInstantiator<B>): B
  /**
   *
   * @param klass
   * @param defaults
   */
  require<T>(klass: new () => T, defaults?: Partial<T>): o.Observable<T>
  require(
    // this: Partial<>,
    def: new (...a: any[]) => any,
    defaults?: any
  ): unknown {

    var result = this.registry.get(def, defaults)
    this[requirements].add(result)
    return result
  }

  /**
   * Display the contents of a block
   * @param fn
   */
  display(
    v: Symbol
  ): Node {
    return this.app.display(v)
  }

}


export const MainView = Symbol('main-view')


/**
 * A registry that holds types mapped to their instance.
 */
export class Registry {

  private cache = new Map<BlockInstantiator<any> | (new () => any), any>()
  private children = new Set<Registry>()
  private persistents = new Set<Block>()
  private parent: Registry | null = null
  private init_list: Block[] = []
  public active_blocks = new Set<BlockInstantiator>()

  constructor(public app: App) { }

  setParent(parent: Registry | null) {
    if (parent != null) {
      parent.children.add(this)
    } else if (this.parent != null) {
      this.parent.children.delete(this)
    }
    this.parent = parent
  }

  get<T>(klass: new () => T, defaults?: any): o.Observable<T>
  get<B extends Block>(creator: BlockInstantiator<B>): B
  get(key: any, defaults?: any): any {
    // First try to see if we own a version of this service.
    var first_attempt = this.cache.get(key)

    if (first_attempt) return first_attempt

    // If we didn't and we have a parent, then we try to ask it
    // if it holds a value
    if (this.parent) {
      var second_attempt = this.parent.cache.get(key)
      if (second_attempt) return second_attempt
    }

    // If neither we nor the parent have the instance, create it ourselve.
    // We just check that the asked class/function has one argument, in which
    // case we give it the app as it *should* be a block (we do not allow
    // constructors with parameters for data services)
    var result = key.prototype instanceof Block || key === Block ? new key(this.app) : o(new key())
    this.cache.set(key, result)
    if (result instanceof Block)
      this.init_list.push(result)
    if (result[Persist])
      this.persistents.add(result)
    return result
  }

  getViews() {
    var views = new Map<Symbol, () => Node>()
    this.active_blocks.forEach(inst => {
      var block = this.get(inst)
      block.runOnRequirementsAndSelf(b => {
        for (var sym of Object.getOwnPropertySymbols(b)) {
          var fn = (b as any)[sym]
          if (typeof sym === 'symbol' && typeof fn === 'function' && fn.length === 0) {
            views.set(sym, fn)
          }
        }
      })
    })
    return views
  }

  activate(blocks: BlockInstantiator[], data: Object[]) {
    for (var d of data) {
      this.setData(d)
    }
    this.active_blocks = new Set(blocks)
    this.active_blocks.forEach(b => this.get(b))
    this.cleanup()
    this.initPending()
  }

  setData(v: any) {
    var prev = this.cache.get(v.constructor) as o.Observable<any>
    if (prev) {
      prev.set(v)
    } else {
      this.cache.set(v.constructor, o(v))
    }
  }

  /**
   * Remove entries from the registry
   */
  protected cleanup() {
    var mark = new Set<Function>()

    this.persistents.forEach(b => b.mark(mark))
    this.active_blocks.forEach(bl => {
      var b = this.cache.get(bl) as Block
      b.mark(mark)
    })

    // now, we sweep
    this.cache.forEach((value, key) => {
      if (!mark.has(key)) {
        this.cache.delete(key)
        if (value instanceof Block) {
          value.stopObservables()
          value.deinit()
          value[Inited] = false
        }
      }
    })
  }

  initPending() {
    var i = 0
    try {
      for (var block of this.init_list) {
        // if (block[Inited]) continue
        block[BlockInit]()
        // block.init()
        // block[Inited] = true
        // block.startObservables()
        i++
      }
    } finally {
      this.init_list = this.init_list.slice(i)
    }
  }

}


/**
 * An App is a collection of building blocks that all together form an application.
 * These blocks contain code, data and views that produce DOM elements.
 *
 * At its simplest, the App is activated on one or several blocks. These block in turn
 * can require other blocks or data classes to access them.
 *
 * When changing main blocks, blocks that are no longer needed are de-inited.
 *
 * A block may only exist once in an App.
 *
 * An App may have "sub" Apps, which can contain their own specific versions of blocks.
 *
 * When the App is mounted, it looks for a parent App and takes a subregistry
 * from it if it was found. Otherwise, it will just create its own registry.
 *
 */
export class App extends Mixin<Comment>{

  registry = new Registry(this)

  // o_views really has symbol keys, typescript just does not support
  // this as of now.
  o_views = new o.Observable<Map<Symbol, () => Node>>(new Map)
  active_blocks = new o.Observable<Set<BlockInstantiator>>(new Set())


  constructor(public main_view: Symbol, protected init_list: (BlockInstantiator<any> | Object)[]) {
    super()
  }

  /**
   * Activate blocks to change the application's state.
   *
   * @param params The blocks to activate, some states to put in the
   * registry already initialized to the correct values, etc.
   */
  activate(...params: (BlockInstantiator<any> | Object)[]) {
    var data = params.filter(p => typeof p !== 'function')
    var blocks = params.filter(p => typeof p === 'function') as BlockInstantiator[]
    this.registry.activate(blocks, data)
    this.active_blocks.set(this.registry.active_blocks)
    this.o_views.set(this.registry.getViews())
  }

  /**
   *
   */
  inserted() {
    // Look for a parent app. If found, pick a subregistry and register it.
    var parent_app = App.get(this.node.parentNode!, true)
    this.registry.setParent(parent_app ? parent_app.registry : null)
    this.activate(...this.init_list)
  }

  /**
   *
   */
  removed() {
    this.registry.setParent(null)
  }

  display(sym: Symbol) {
    return Display(this.o_views.tf(v => {
      var view = v.get(sym)
      return view && view()
    })) as Comment
  }

}


/**
 * Display the application.
 *
 * @param main_view The symbol of the view to display
 * @param params Initialisation parameters
 */
export function DisplayApp(main_view: Symbol, ...params: (BlockInstantiator<any> | Object)[]) {
  var app = new App(main_view, params)
  var disp = app.display(main_view)
  app.addToNode(disp)
  return disp
}