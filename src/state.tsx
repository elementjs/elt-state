
import { o, Observable } from 'elt'


/**
 * Nouvelle idée : on fait des require, comme avec les services d'avant, sauf que
 *
 *   - les blocks sont des méthodes des services
 *   - on ne peut require que des services dont les states sont des sous-classes ou la même
 *   - les blocks sont résolus dans l'ordre des require.
 *   - on active un service avec un state donné !
 */


/**
 * The base class to create services.
 *
 * Services are meant to be used by *composition*, and not through extension.
 * Do not subclass a service unless its state is the exact same type.
 */
export class Partial<State> {

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
  async init(next_state: State) {

  }

  /**
   *
   */
  async postInit() {

  }

  /**
   *
   * @param service The class of the service an instance
   */
  require<BaseState, ThisState extends BaseState>(
    this: Partial<ThisState>,
    service: new (...a: any[]) => Partial<BaseState>
  ) {

  }

  /**
   * Change the active partial.
   *
   * This method is asynchronous, because it will return only when the state has been
   * effectively changed (and thus after all the `init()` have been called)
   *
   * @param partial The partial to activate
   * @param state
   */
  async partial<OtherState>(partial: new (...a: any[]) => Partial<OtherState>, state: OtherState) {
    // Go the the other service
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

  active_partial = o(null as Partial<any> | null)


}