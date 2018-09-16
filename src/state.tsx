
import { Observable, ReadonlyObserver, Display, o, Component, Attrs, instanciate_verb, Mixin } from 'elt'

export const InitList = Symbol('initlist')
export const Init = Symbol('init')
export const Inited = Symbol('inited')
export const DeInit = Symbol('deinit')

export interface BlockInstantiator {
  new (app: App): Block
}


export class State {

  // FIXME use o.assign ?
  create<S extends State>(this: new () => S, ...values: Partial<S>[]) {
    var c = new this()
    Object.assign(c, ...values)
    return c
  }

  clone(values: Partial<this>) {
    var co = this.constructor as new () => this
    var c = new co()
    Object.assign(c, this, values)
    return c
  }

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
  is_static = false

  private [requirements] = new Set<new (...a: any[]) => any>()
  protected observers: ReadonlyObserver<any, any>[] = []

  constructor(public registry: Registry) {
    // The following any is mandatory since the o_state from app is known just as
    // a basic Observable<State> and not the particular subclass we are using now.
  }

  /**
   * Extend this method to run code whenever the block is created and
   * integrated.
   */
  async init(): Promise<any> {

  }

  /**
   * Extend this method to run code whenever this block is cleared from the app.
   */
  async deinit(): Promise<any> {

  }

  /**
   *
   * @param block_def
   */
  require<B extends Block>(block_def: new (app: App) => B): B
  /**
   * 
   * @param klass
   * @param defaults
   */
  require<T>(klass: new () => T, defaults?: Partial<T>): Observable<T>
  require(
    // this: Partial<>,
    def: new (...a: any[]) => any,
    defaults?: any
  ): unknown {

    this[requirements].add(def)

    var res = def.length > 1 ? new def(this.registry) : new def()
    // this[InitList].push(s)
    return res
    // ... ?
  }

  /**
   * Display the contents of a block
   * @param fn
   */
  display(
    v: Symbol
  ): Node {
    return this.registry.display(v)
  }

}


export const MainView = Symbol('main-view')


/**
 * A registry that holds types mapped to their instance.
 */
export class Registry {

  private cache = new Map<any, any>()
  private children = new Set<Registry>()
  private parent: Registry | null = null

  setParent(parent: Registry | null) {
    if (parent != null) {
      parent.children.add(this)
    } else if (this.parent != null) {
      this.parent.children.delete(this)
    }
    this.parent = parent
  }

  constructor(public app: App) { }

  get<T>(klass: new () => T): T
  get(creator: BlockInstantiator): Block
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
    var result = key.length === 1 ? new key(this.app) : new key()
    this.cache.set(key, result)
    return result
  }

  /**
   * Remove entries from the registry
   */
  cleanup() {

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
  o_views = new Observable<{[key: string]: () => Node}>({})

  constructor(public main_view: Symbol) { 
    super() 
  }

  /**
   * Activate blocks to change the application's state.
   * 
   * @param params The blocks to activate, some states to put in the
   * registry already initialized to the correct values, etc.
   */
  activate(...params: (BlockInstantiator|State)[]) {

    var par: any
    for (par of params) {

    }

    // Extract the views from the currently active blocks
    var views: any = {}
    // this.registry.forEach(value => {
    //   for (var x in value) {
    //     if (typeof x === 'symbol' && typeof value[x] === 'function' && value[x].length === 0)
    //       views[x] = value[x]
    //   }
    // })
    this.o_views.set(views)
  }

  /**
   * 
   */
  inserted() {
    // Look for a parent app. If found, pick a subregistry and register it.
    var parent_app = App.get(this.node.parentNode!, true)
    this.registry.setParent(parent_app ? parent_app.registry : null)
  }

  /**
   * 
   */
  removed() {
    this.registry.setParent(null)
  }

}


/**
 * Display the application.
 * 
 * @param main_view The symbol of the view to display
 * @param params Initialisation parameters
 */
export function DisplayApp(main_view: Symbol, ...params: (BlockInstantiator|State)[]) {
  var app = new App(main_view)
  var disp = Display(app.o_views.tf(v => v[main_view as any] && v[main_view as any]())) as Comment
  app.addToNode(disp)
  return disp
}