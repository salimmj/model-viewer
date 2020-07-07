/* @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License atQ
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '@babylonjs/loaders/glTF';

import {ArcRotateCamera, Axis, Color4, Engine, HDRCubeTexture, Matrix, Scene, SceneLoader, Space, Tools, Vector3} from '@babylonjs/core';
import {css, customElement, html, LitElement, property} from 'lit-element';

import {ScenarioConfig} from '../../common.js';

const $initialize = Symbol('initialize');
const $updateScenario = Symbol('updateScenario');
const $updateSize = Symbol('updateSize');
const $canvas = Symbol('canvas');
const $engine = Symbol('engine');
const $scene = Symbol('scene');
const $degToRadians = Symbol('degToRadians');


@customElement('babylon-viewer')
export class BabylonViewer extends LitElement {
  @property({type: Object}) scenario: ScenarioConfig|null = null;
  private[$canvas]: HTMLCanvasElement|null;
  private[$engine]: Engine;
  private[$scene]: Scene;


  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    this[$updateSize]();

    if (changedProperties.has('scenario') && this.scenario != null) {
      this[$updateScenario](this.scenario);
    }
  }

  static get styles() {
    return css`
:host {
 display: block;
}
`;
  }

  render() {
    return html`<canvas id="canvas"></canvas>`;
  }


  private[$initialize]() {
    this[$canvas] = this.shadowRoot!.querySelector('canvas');
    this[$engine] = new Engine(this[$canvas], true);
    SceneLoader.ShowLoadingScreen = false;
  }


  private async[$updateScenario](scenario: ScenarioConfig) {
    // call initialize here instead of inside constructor because in lit
    // element's life cycle, canvas element is added to dom after the
    // constructor is called.
    if (this[$engine] == null) {
      this[$initialize]();
    }

    if (this[$scene] != null) {
      this[$scene].dispose();
    }
    this[$scene] = new Scene(this[$engine]);
    this[$updateSize]();

    const {orbit, target, verticalFoV, renderSkybox, clearColor} = scenario;

    this[$scene].clearColor =
        new Color4(clearColor.r, clearColor.g, clearColor.b, clearColor.a);

    const alpha = this[$degToRadians](orbit.theta + 90);
    const beta = this[$degToRadians](orbit.phi);
    const camera = new ArcRotateCamera(
        'Camera',
        alpha,
        beta,
        orbit.radius,
        new Vector3(
            -target.x,  // babylon use oppsite x coordinate than model-viewer
            target.y,
            target.z),
        this[$scene]);
    camera.attachControl(this[$canvas]!, true);
    // in babylon, camera use VERTICAL_FIXED mode by default, so fov here is
    // equal to vertical fov
    camera.fov = this[$degToRadians](verticalFoV);

    const lastSlashIndex = scenario.model.lastIndexOf('/');
    const modelRootPath = scenario.model.substring(0, lastSlashIndex + 1);
    const modelFileName =
        scenario.model.substring(lastSlashIndex + 1, scenario.model.length);

    await SceneLoader.AppendAsync(modelRootPath, modelFileName, this[$scene])
        .then(() => {
          const {min, max} =
              this[$scene].meshes[0].getHierarchyBoundingVectors();
          const modelRadius =
              Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
          const farClip = 2 * Math.max(modelRadius, orbit.radius);
          const nearClip = farClip / 1000;
          // not setting maxZ(far clip) because it will clip the skybox, and the
          // rendering result is the same
          camera.minZ = nearClip;
        });

    this[$scene].stopAllAnimations();

    // load and prefilter HDR texture (the size of cubmap is set to be 256 for
    // all renderers)
    const environment = new HDRCubeTexture(
        scenario.lighting, this[$scene], 256, false, false, false, true);
    this[$scene].environmentTexture = environment;
    // rotate environment for 90 deg, skybox for 270 deg to match the rotation
    // in other renderers
    environment.setReflectionTextureMatrix(
        Matrix.RotationY(Tools.ToRadians(90)));
    if (renderSkybox) {
      const skybox =
          this[$scene].createDefaultSkybox(this[$scene].environmentTexture!);
      skybox!.rotate(Axis.Y, Math.PI * 1.5, Space.WORLD);
      skybox!.infiniteDistance = true;
    }

    this[$engine].runRenderLoop(() => {
      this[$scene].render();
    });

    this[$scene].executeWhenReady(() => {
      requestAnimationFrame(() => {
        this.dispatchEvent(
            new CustomEvent('model-visibility', {detail: {visible: true}}));
      });
    });
  }


  private[$updateSize]() {
    if (this[$canvas] == null || this.scenario == null) {
      return;
    }

    const canvas = this[$canvas]!;
    const {dimensions} = this.scenario;

    const dpr = window.devicePixelRatio;
    const width = dimensions.width * dpr;
    const height = dimensions.height * dpr;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
  }

  private[$degToRadians](degree: number) {
    return Math.PI * (degree / 180);
  }
}
