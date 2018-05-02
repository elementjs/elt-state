
import { o, Observable, AssignPartial } from 'elt'

/**
 * Nouvelle idée : on fait des require, comme avec les services d'avant, sauf que
 *
 *   - les blocks sont des méthodes des services
 *   - on ne peut require que des services dont les states sont des sous-classes ou la même
 *   - les blocks sont résolus dans l'ordre des require.
 *   - on active un service avec un state donné !
 */
export const InitList = Symbol('initlist')

export interface Screen<State> {
  new (...a: any[]): Partial<State>
  state_type: new () => State
  stateInit?: (state: State) => Promise<State>
}

/**
 * The base class to create services.
 *
 * Services are meant to be used by *composition*, and not through extension.
 * Do not subclass a service unless its state is the exact same type.
 */
export class Partial<State> {

  private [InitList]: Partial<any>[] = []

  constructor(app: App) {
    this.o_state = app.o_state
  }

  /**
   * The state observable.
   *
   * This object instance is actually shared by all the partials active in a same
   * app. It is never recreated.
   */
  o_state!: Observable<State>

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
  async init(next_state: State): Promise<State | void> {
    for (var p of this[InitList]) {
      next_state = await p.init(next_state) || next_state
    }
    return next_state
  }

  /**
   * This is run once the screen has been drawn, in the same order.
   */
  async postInit() {
    for (var p of this[InitList]) {
      await p.postInit()
    }
  }

  /**
   *
   * @param service The class of the service an instance
   */
  require<BaseState, ThisState extends BaseState, P extends Partial<BaseState>> (
    this: Partial<ThisState>,
    service: new (...a: any[]) => P
  ): P {
    // ... ?
  }

  async changeScreen<OtherState>(screen: Screen<OtherState>, new_values: AssignPartial<OtherState>) {
    // Go the the other partial
  }


  /**
   * Display the contents of a block
   * @param fn
   */
  block<BaseState, ThisState extends BaseState>(
    this: Partial<ThisState>,
    fn: (this: Partial<BaseState>) => Node
  ) {

  }

}


/**
 *
 */
export class App {

  active_screen = o(null as Partial<any> | null)

  all_active_partials = new Map<typeof Partial, Partial<any>>()

  constructor(public o_state: Observable<any>) {

  }

  changeScreen<State>(screen: Screen<State>, new_values: AssignPartial<State>) {
    var inst = new screen.state_type()
    const cur = this.o_state.get()

    for (var x in cur) {
      if (x in inst)
        (inst as any)[x] = cur[x]
    }

    // We know what we're doing.
    inst = o.assign(inst, new_values)

    const next_screen = new screen(this.o_state)
  }
}