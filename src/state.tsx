
import { o, Observable, AssignPartial, Display, RO, ObserverFunction, ReadonlyObserver, Changes, ReadonlyObservable } from 'elt'

export const InitList = Symbol('initlist')
export const Init = Symbol('init')
export const Inited = Symbol('inited')
export const DeInit = Symbol('deinit')

export interface Screen<S extends State> {
  new (...a: any[]): Block<S>
  stateInit?: (state: S) => Promise<S>
}

export interface BlockInstantiator<S extends State> {
  new (app: App): Block<S>
}


export class State {

}


/**
 * The base class to create services.
 *
 * Services are meant to be used by *composition*, and not through extension.
 * Do not subclass a service unless its state is the exact same type.
 */
export class Block<S extends State> {

  private [InitList]: Block<State>[] = []
  protected observers: ReadonlyObserver<any, any>[] = []

  constructor(public app: App) {
    // The following any is mandatory since the o_state from app is known just as
    // a basic Observable<State> and not the particular subclass we are using now.
    this.o_state = app.o_state as any
  }

  /**
   * The state observable.
   *
   * This object instance is actually shared by all the partials active in a same
   * app. It is never recreated.
   */
  o_state: Observable<S>

  /**
   * Set the state to another State instance. This instance does not have to be
   * related to the current instance ; this method is used to transition between
   * very varied states of the application.
   *
   * @param new_state: the new state to transition to.
   */
  setNewState(new_state: State) {
    this.o_state.set(new_state as any)
  }

  /**
   * Assign values to the current state. Shorthand for this.o_state.assign(values)
   *
   * @param values: The values to assign to the current state.
   */
  assign(values: AssignPartial<S>) {
    return this.o_state.assign(values)
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
  async init(state: Readonly<S>): Promise<any> {

  }

  async deinit(): Promise<any> {

  }

  private [Inited] = false
  async [Init](state: S): Promise<S | void> {
    // No need to reinit an already inited state.
    if (this[Inited]) return state

    for (var p of this[InitList]) {
      state = (await p[Init](state) || state) as S
    }
    this[Inited] = true
    return await this.init(state) || state
  }

  [DeInit]() {
    this.deinit()
    for (var ob of this.observers) ob.stopObserving()
  }

  /**
   *
   * @param block_def The class of the service an instance
   */
  require<P extends Block<any>>(
    // this: Partial<>,
    block_def: new (app: App) => P
  ): P {
    // We should look up if we instanciated this service already.
    var s = new block_def(this.app)
    this[InitList].push(s)
    return s
    // ... ?
  }

  /**
   * Display the contents of a block
   * @param fn
   */
  view(
    name: keyof this
  ): Node {
    return this.app.view(name as string)
  }

  observe<T, U = void>(a: RO<T>, cbk: ObserverFunction<T, U>): ReadonlyObserver<T, U>
  observe<T, U = void>(a: RO<T>, cbk: ObserverFunction<T, U>, immediate: true): ReadonlyObserver<T, U> | null
  observe<T, U = void>(a: RO<T>, cbk: ReadonlyObserver<T, U> | ObserverFunction<T, U>, immediate?: boolean): ReadonlyObserver<T, U> | null {
    if (immediate && !(a instanceof Observable)) {
      typeof cbk === 'function' ? cbk(a as T, new Changes(a as T)) : cbk.call(a as T)
      return null
    }

    const ob: ReadonlyObservable<T> = a instanceof Observable ? a : o(a)
    const observer = typeof cbk === 'function' ?  ob.createObserver(cbk) : cbk
    this.observers.push(observer)

    if (immediate) {
      observer.call(o.get(ob))
    }

    observer.startObserving()
    return observer
  }

  /**
   * Extract the blocks object which contains the views bound to the correct partial.
   */
  get views() {
    var res: {[name: string]: () => Node} = {}

    this.all_partials.forEach(p => {
      for (var x in p) {
        if (x[0] >= 'A' && x[0] <= 'Z')
          // This is an error ! They will be recreated all the time !
          res[x] = (p as any)[x].bind(p)
      }
    })
    return res

  }

  get all_partials() {
    var res = new Set<Block<any>>()
    function fill(p: Block<any>) {
      for (var _ of p[InitList]) {
        if (!res.has(_)) {
          fill(_)
        }
      }
      res.add(p)
    }
    fill(this)
    return res
  }

}


export const MainView = Symbol('main-view')


export type BlockMap = Map<typeof Block, Block<any>>

/**
 *
 */
export class App {

  constructor(public o_state: Observable<State>) { }
  current_blocks: BlockMap | null = null
  current_views?: {[sym: Symbol]: () => Node}

  protected o_partials = this.o_state.tf((new_state, old_state, current_value) => {
    // If new_state and old_state have a different type, then
    // we're going to build the partials

    // Otherwise, just return the current partials that were already computed
    return current_value
  })

  asNode(): Node {

  }

  view(name: string | Symbol) {
    return Display(this.o_partials.tf(partials => {
      var result: undefined | (() => Node)

      partials.forEach(partial => {
        var r = (partial as any)[name as any]
        if (typeof r === 'function') {
          result = r
        }
      })

      return result
    }).tf(b => b ? b() : null))
  }

}