import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LibraryService, OhadaHub, frDate } from '../../services/library.service';

/** Droit OHADA applicable en Guinée : Actes uniformes, traités, règlements et décisions de la CCJA. */
@Component({
  selector: 'app-ohada',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ohada.html',
  styleUrl: './ohada.scss',
})
export class Ohada implements OnInit {
  private lib = inject(LibraryService);
  private router = inject(Router);
  readonly frDate = frDate;

  hub = signal<OhadaHub | null>(null);
  loading = signal(true);
  error = signal('');

  /** Ce que règle chaque Acte uniforme, pour s'orienter (sigle → domaine). */
  readonly themes: Record<string, string> = {
    AUSCGIE: 'Créer, gérer, transformer ou dissoudre une société (SARL, SA, SAS, SNC, GIE)',
    AUDCG: 'Statut du commerçant, RCCM, bail commercial, fonds de commerce, vente commerciale',
    AUPSRVE: 'Recouvrer une créance : injonction de payer, saisies, voies d’exécution',
    AUPCAP: 'Entreprise en difficulté : conciliation, redressement, liquidation',
    AUS: 'Garanties : cautionnement, gage, nantissement, hypothèque',
    AUSCOOP: 'Sociétés coopératives',
    AUA: 'Arbitrage commercial',
    AUM: 'Médiation',
    AUCTMR: 'Transport de marchandises par route',
    AUDCIF: 'Comptabilité et information financière (SYSCOHADA)',
    SYCEBNL: 'Comptabilité des associations, ONG et fondations',
  };

  ngOnInit(): void {
    this.lib.ohada().subscribe({
      next: h => { this.hub.set(h); this.loading.set(false); },
      error: () => { this.error.set('Le droit OHADA n’a pas pu être chargé.'); this.loading.set(false); },
    });
  }

  sigle(nom: string): string {
    const m = /\(([A-Z]{2,8})\)\s*$/.exec(nom) || /—\s*(SYCEBNL)/.exec(nom);
    return m ? m[1] : '';
  }

  ask(sigle: string, nom: string): void {
    this.router.navigate(['/dashboard/chat'], {
      queryParams: { q: `Que prévoit l’${sigle ? sigle : nom} (droit OHADA applicable en Guinée) sur ` },
    });
  }

  label(d: { juridiction: string; date: string; numero: string }): string {
    return [d.juridiction.replace(' (OHADA)', ''), frDate(d.date), d.numero ? `n° ${d.numero}` : ''].filter(Boolean).join(', ');
  }
}
