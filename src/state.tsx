
import { Observable, ReadonlyObserver, Display } from 'elt'

export const InitList = Symbol('initlist')
export const Init = Symbol('init')
export const Inited = Symbol('inited')
export const DeInit = Symbol('deinit')

export interface BlockInstantiator {
  new (app: App): Block
}


export class State {
  static create<S extends State>(this: new () => S, values: Partial<S>) {
    var res = new this()
    for (var a in values) {
      (res as any)[a] = values[a]
    }
    return res
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

  private [requirements] = new Set<new (...a: any[]) => any>()
  protected observers: ReadonlyObserver<any, any>[] = []

  constructor(public app: App) {
    // The following any is mandatory since the o_state from app is known just as
    // a basic Observable<State> and not the particular subclass we are using now.
  }

  /**
   * Implement this method if this service is to do some calls/modify things *before*
   * actually commiting the state.
   *
   * Treat the next_state object as an immutable object ; it will be the next object
   * to be applied to o_state. Use `o.assign` to change its values to make sure
   * that it is properly changed.
   *
   * Do not use `this.o_state` in this method.
   *
   * This method may fail, which will ultimately prevent setting the next_state to
   * o_state. You may use this for instance when checking if the user is still logged in.
   *
   * @param next_state The next state that is about to be set throughout the application.
   */
  async init(): Promise<any> {

  }

  async deinit(): Promise<any> {

  }

  /**
   *
   * @param block_def The class of the service an instance
   */
  require<B extends Block>(block_def: new (app: App) => B): B
  require<T>(klass: new () => T, defaults?: Partial<T>): Observable<T>
  require(
    // this: Partial<>,
    def: new (...a: any[]) => any,
    defaults?: any
  ): unknown {

    this[requirements].add(def)

    var res = def.length > 1 ? new def(this.app) : new def()
    // this[InitList].push(s)
    return res
    // ... ?
  }

  /**
   * Display the contents of a block
   * @param fn
   */
  view(
    v: Symbol
  ): Node {
    return this.app.view(v)
  }

}


export const MainView = Symbol('main-view')

/**
 *
 */
export class App {

  constructor() { }
  registry = new Map<new (...a: any[]) => any, any>()
  o_views = new Observable<any>({})

  activate(...params: (BlockInstantiator|State)[]) {
    var new_registry = new Map<new (...a: any[]) => any, any>()

    var par: any
    for (par of params) {

    }

    // Extract the views from the currently active blocks
    var views: any = {}
    this.registry.forEach(value => {
      for (var x in value) {
        if (typeof x === 'symbol')
          views[x] = value[x]
      }
    })
    this.o_views.set(views)
  }

  view(v: Symbol): Node {
    // urgh... really should not need that any
    return Display(this.o_views.p(v as any))
  }

}