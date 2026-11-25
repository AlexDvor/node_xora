import { Component, signal } from '@angular/core';

@Component({
  host: { '[class.alternative-accent]': 'alternativeAccent()' },
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly alternativeAccent = signal(false);

  protected toggleAccent(): void {
    this.alternativeAccent.update((active) => !active);
  }
}
