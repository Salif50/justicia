import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-search-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class SearchPage {
  active = 'all';
  categories = computed(() => {
    const r = this.search.results();
    return [
      { id: 'all', label: 'Tout', count: this.search.totalResults },
      { id: 'conversations', label: 'Consultations', count: r.conversations.length },
      { id: 'cases', label: 'Dossiers', count: r.cases.length },
      { id: 'documents', label: 'Documents', count: r.documents.length },
      { id: 'notes', label: 'Notes', count: r.notes.length },
    ];
  });

  constructor(public search: SearchService, private router: Router) {}

  setQuery(value: string) { this.search.search(value); }
  open(link: string) { if (link) this.router.navigateByUrl(link); }
  date(value: string) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
}
