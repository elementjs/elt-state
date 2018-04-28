
import { Observable, Displayer, instanciate_verb, TransformObservable } from 'elt'


export class BaseState {

}

export type Creator<T> = new (...a: any[]) => T

export type ScreenCreator<State, BaseScreen, ResultScreen> = (state: Observable<State>, parent: Creator<BaseScreen>) => Creator<ResultScreen>

export type ScreenDefinition<BaseState, BaseScreen> = {
  extend<A extends BaseState, B>(
    typ: new (...a: any[]) => A,
    def: ScreenCreator<A, BaseScreen, BaseScreen & B>
  ): ScreenDefinition<A, B>
}


/**
 * What is the relationship between screen and state ??
 */
export class App {

  registry = new Map<any, {
    creator: ScreenCreator<any, Screen, Screen>,
    parent: Creator<Screen> | null
  }>()

  creator_instances = new Map<any, any>()

  o_screen = new Observable(null as Screen | null)

  constructor(public o_state: Observable<any>) { }

  /**
   * Create a screen definition for the given state type.
   */
  screen<T, U extends Screen, Base extends Screen = Screen>(typ: Creator<T>, def: ScreenCreator<T, Base, U>, parent?: ScreenDefinition<any, any>): ScreenDefinition<T, U> {
    // check that the state type isn't already in the registry
    this.registry.set(typ, {
      creator: def,
      parent: null
    })
    var _this = this
    var res = {
      extend<A extends T, B>(typ: Creator<A>, creator: ScreenCreator<A, U, U & B>) {
        _this.screen(typ, creator, res)
      }
    } as ScreenDefinition<T, U>

    return res
  }

  /**
   * When the state changes, find the corresponding screen and instanciate it along with its dependencies.
   */
  changeScreen(state_obj: any) {

    // First, we get the screen type that matches with the given state.
    const cons = state_obj.constructor
    const create = this.registry.get(cons)

    if (!create)
      throw new Error(`No screen definition for instance type '${cons.name}'`)

    // Get the list of new screen objects that will need to be instanciated and linked together.
    // Stop at the first sign that one of them is already instanciated, as it doesn't have to
    // be recreated

    // We can now create the messy prototype chain.

    // Now that we're done, set the leafest screen to this.o_screen to replace the current blocks.

  }

  /**
   * Render the main block of the application.
   */
  main() {

  }
}


/**
 * The base screen definition.
 */
export class Screen {

  app!: App

  async leave(): Promise<void> {

  }

  async init(): Promise<void> {

  }

  block<K extends keyof this & Symbol>(t: K) {
    return instanciate_verb(new Displayer(
      this.app.o_screen.tf(s => s ? (s as any)[t] : null).tf((method: null | (() => Node)) =>
        method ? method.call(this) : null
      )
    ))
  }

}


export const ContentBlock = Symbol('content')
export const Main = Symbol('main-block')
const o_state = new Observable(new BaseState())
export class SubState extends BaseState {
  a: number = 10
  b: number = 15
}

export class SubState2 extends SubState {
  c: string = 'dsf'
}

export class Test extends SubState2 {
  d: string = 'pouet'
}
var app = new App(o_state)


export const MyScreen = app.screen(SubState, (state, Super) => class Pouet extends Super {

  o_derived = state.tf(a => a.a + 3, (b, o, obs) => obs.assign({a: 4})) as TransformObservable<SubState, number>

  [ContentBlock]() {

  }

  [Main]() {
    return <div>
      {this.o_derived}
      {state.p('b')}
      {this.block(ContentBlock)}
    </div>
  }

})


export const MyScreen2 = MyScreen.extend(SubState2, (state, Super) => class MyScreen2 extends Super {
  [Main]() {
    return <div>{this.o_derived}</div>
  }
})


export const Ppp = MyScreen2.extend(Test, (state, Super) => class Ppp extends Super {

})
