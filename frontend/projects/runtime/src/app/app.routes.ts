import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page.component';
import { ScreenPage } from './pages/screen-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomePage },
  { path: ':useCase/:screen', component: ScreenPage },
  { path: '**', redirectTo: '' },
];
