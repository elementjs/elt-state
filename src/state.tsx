
import { Display, Mixin, o } from 'elt'


export const Inited = Symbol('inited')


export interface BlockInstantiator<B extends Block> {
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

  preInit() {
    for (var o of this.observers) {
      o.startObserving()
    }
  }

  /**
   * Extend this method to run code whenever the block is created and
   * integrated.
   */
  async init(): Promise<any> {

  }

  preDeInit() {
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
    return this.app.active_blocks.indexOf(this.constructor as BlockInstantiator<any>) > -1
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
  private parent: Registry | null = null
  private init_list: Block[] = []

  setParent(parent: Registry | null) {
    if (parent != null) {
      parent.children.add(this)
    } else if (this.parent != null) {
      this.parent.children.delete(this)
    }
    this.parent = parent
  }

  constructor(public app: App) { }

  get<T>(klass: new () => T, defaults?: any): T
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
    return result
  }

  getViews() {
    var views: any = {}
    this.cache.forEach(value => {
      if (!(value instanceof Block)) return
      for (var x of Object.getOwnPropertySymbols(value)) {
        var prop = (value as any)[x]
        if (typeof x === 'symbol' && typeof prop === 'function' && prop.length === 0) {
          views[x] = prop
        }
      }
    })
    return views
  }

  add(v: any) {
    this.cache.set(v.constructor, v)
  }

  /**
   * Remove entries from the registry
   */
  cleanup(active_blocks: BlockInstantiator<any>[]) {
    var mark = new Set<Function>()
    for (var bl of active_blocks) {
      var b = this.cache.get(bl) as Block
      b.mark(mark)
    }

    // now, we sweep
    this.cache.forEach((value, key) => {
      if (!mark.has(key)) {
        this.cache.delete(key)
        if (value instanceof Block) {
          value.preDeInit()
          value.deinit()
          value[Inited] = false
        }
      }
    })
  }

  async initPending() {
    var i = 0
    try {
      for (var block of this.init_list) {
        await block.init()
        block[Inited] = true
        for (var ob of block.observers) {
          ob.startObserving()
        }
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
  o_views = new o.Observable<{ [key: string]: () => Node }>({})
  active_blocks = [] as BlockInstantiator<any>[]


  constructor(public main_view: Symbol, protected init_list: (BlockInstantiator<any> | Object)[]) {
    super()
  }

  /**
   * Activate blocks to change the application's state.
   *
   * @param params The blocks to activate, some states to put in the
   * registry already initialized to the correct values, etc.
   */
  async activate(...params: (BlockInstantiator<any> | Object)[]) {
    params.filter(p => typeof p !== 'function').forEach(d => this.registry.add(d))
    var blocks = params.filter(p => typeof p === 'function') as BlockInstantiator<any>[]
    blocks.forEach((d: any) => this.registry.get(d))
    this.registry.cleanup(blocks)
    this.active_blocks = blocks

    // Extract the views from the currently active blocks
    this.o_views.set(this.registry.getViews())

    // Launch the init of each block
    this.registry.initPending()
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
      return v[sym as any] && v[sym as any]()
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
  var disp = Display(app.o_views.tf(v => v[main_view as any] && v[main_view as any]())) as Comment
  app.addToNode(disp)
  return disp
}