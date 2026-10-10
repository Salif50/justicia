import { Component, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule }                                 from '@angular/common';
import { RouterLink }                                   from '@angular/router';
import { Header }                                       from '../../components/header/header';
import { Footer }                                       from '../../components/footer/footer';

@Component({
  selector:    'app-pcu',
  imports:     [CommonModule, RouterLink, Header, Footer],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
})
export class Terms implements AfterViewInit, OnDestroy {
  activeSection = signal<string>('introduction');
  private observer!: IntersectionObserver;

  readonly sections = [
    { id: 'introduction',     label: 'Introduction' },
    { id: 'definition',       label: 'Définition du service' },
    { id: 'avertissement',    label: 'Avertissement juridique' },
    { id: 'responsabilite',   label: 'Limitation de responsabilité' },
    { id: 'utilisation',      label: 'Conditions d\'utilisation' },
    { id: 'donnees',          label: 'Données personnelles' },
    { id: 'propriete',        label: 'Propriété intellectuelle' },
    { id: 'modifications',    label: 'Modifications' },
    { id: 'acceptation',      label: 'Acceptation' },
  ];

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            this.activeSection.set(e.target.id);
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    this.sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) this.observer.observe(el);
    });
  }

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnDestroy() { if (this.observer) this.observer.disconnect(); }
}
